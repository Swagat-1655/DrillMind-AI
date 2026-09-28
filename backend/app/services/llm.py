"""AI Drilling Copilot.

Retrieval-augmented generation over the platform's own knowledge base, served
by Groq (OpenAI-compatible chat completions). When the LLM is unreachable the
copilot degrades to a deterministic analytical answer assembled from the
retrieval hits and the hazard engine, so the demo never shows a dead panel.
"""

from __future__ import annotations

import json
from typing import AsyncIterator, Dict, List, Optional

import httpx

from ..config import Settings, settings as default_settings
from ..data import EVENT_LABELS, HAZARDS
from .analytics import nearby_wells
from .risk import depth_profile, well_risk_summary
from .similarity import similar_wells

SYSTEM_PROMPT = """You are DrillMind Copilot, the AI decision-support assistant inside \
DrillMind AI — a Nearby Wells Intelligence System used by drilling engineers in the \
Assam-Arakan, Cambay and Krishna-Godavari basins.

You are given:
  1. LIVE CONTEXT — the active well's current state and hazard predictions.
  2. RETRIEVED EVIDENCE — numbered extracts from well completion reports, incident
     reports, daily drilling reports, mud logging summaries and lessons-learned notes.

Rules:
  - Answer as an experienced drilling engineer / well engineer would: specific,
    operational and quantitative. Always give depths in metres, mud weight in ppg,
    and name the formation.
  - Cite evidence inline with bracketed numbers, e.g. "[2]", matching the numbered
    extracts. Only cite numbers that were actually supplied.
  - If the evidence does not cover the question, say so plainly and state what you
    would need (a specific report, D-exponent trend, pore-pressure plot, etc.).
  - Never invent a well name, depth or event that is not in the supplied context.
  - Prefer concrete recommendations ("prepare an LCM treatment with a fine/medium/coarse
    carbonate blend before 4180 m") over generic advice.
  - Use short paragraphs and tight bullet lists. Bold the key numbers.
  - Keep the answer under 320 words unless the engineer explicitly asks for a
    full programme or report.
  - If the engineer writes in Hindi, answer in Hindi using standard Indian
    oilfield terminology. Otherwise answer in English.
"""

SUGGESTIONS: List[dict] = [
    {"id": "mudloss", "text": "Show wells with mud losses near 4200 m.", "textHi": "4200 मीटर के आसपास मड लॉस वाले कुएँ दिखाएँ।", "icon": "droplet"},
    {"id": "formation", "text": "What risks exist in the current formation?", "textHi": "वर्तमान संरचना में कौन-कौन से जोखिम हैं?", "icon": "layers"},
    {"id": "torque", "text": "Why is torque increasing?", "textHi": "टॉर्क क्यों बढ़ रहा है?", "icon": "activity"},
    {"id": "mitigation", "text": "Recommend mitigation actions for the next 100 m.", "textHi": "अगले 100 मीटर के लिए उपचार सुझाएँ।", "icon": "shield"},
    {"id": "similar", "text": "Which offset wells are most similar, and what did they teach us?", "textHi": "कौन-से निकटवर्ती कुएँ सबसे समान हैं और उनसे क्या सीखा?", "icon": "network"},
    {"id": "stuck", "text": "How likely is stuck pipe in this hole section and why?", "textHi": "इस खंड में स्टक पाइप की संभावना कितनी है और क्यों?", "icon": "anchor"},
    {"id": "casing", "text": "Where should the next casing seat go?", "textHi": "अगला केसिंग सीट कहाँ होना चाहिए?", "icon": "layers"},
    {"id": "npt", "text": "What has non-productive time cost us in this field?", "textHi": "इस क्षेत्र में एनपीटी ने कितना नुकसान किया?", "icon": "chart"},
]


class Copilot:
    def __init__(self, corpus, knowledge_base, cfg: Optional[Settings] = None) -> None:
        self.corpus = corpus
        self.kb = knowledge_base
        self.settings = cfg or default_settings

    # -- context assembly ---------------------------------------------------

    def live_context(self, focus_well_id: Optional[str] = None, language: str = "en") -> Dict[str, object]:
        well = (
            self.corpus.wells_by_id.get(focus_well_id)
            if focus_well_id
            else None
        ) or self.corpus.primary_well()

        risk = well_risk_summary(self.corpus, well)
        nearby = nearby_wells(self.corpus, well, radius_km=15.0, limit=8)
        analogues = similar_wells(self.corpus, well, limit=5)
        profile = depth_profile(self.corpus, well)
        critical = [band for band in profile["bands"] if band["band"] in {"CRITICAL", "HIGH"}][:4]

        return {
            "language": language,
            "well": {
                "id": well["id"],
                "name": well["name"],
                "field": well["field"],
                "basin": well["basin"],
                "operator": well["operator"],
                "status": well["status"],
                "formation": well["formation"],
                "currentDepthMd": well["currentDepthMd"],
                "totalDepthMd": well["totalDepthMd"],
                "mudWeight": well["mudWeight"],
                "poreEmw": well["poreEmw"],
                "fracEmw": well["fracEmw"],
                "rpm": well["rpm"],
                "wob": well["wob"],
                "rop": well["rop"],
                "flowRate": well["flowRate"],
                "torque": well["torque"],
                "riskScore": well["riskScore"],
                "riskBand": well["riskBand"],
            },
            "risk": risk,
            "nearby": nearby,
            "analogues": analogues,
            "criticalBands": critical,
            "directions": [
                {
                    "formation": entry["name"],
                    "top": entry["topMd"],
                    "base": entry["baseMd"],
                    "poreEmw": entry["poreEmw"],
                    "fracEmw": entry["fracEmw"],
                    "primaryHazard": entry["primaryHazard"],
                }
                for entry in well["formations"]
            ],
        }

    def _context_text(self, context: Dict[str, object]) -> str:
        well = context["well"]  # type: ignore[index]
        risk = context["risk"]  # type: ignore[index]
        lines = [
            "LIVE CONTEXT",
            f"Active well: {well['name']} ({well['id']}), {well['field']} field, {well['basin']} basin, "
            f"operator {well['operator']}, status {well['status']}.",
            f"Current measured depth {well['currentDepthMd']:.0f} m of a {well['totalDepthMd']:.0f} m TD "
            f"programme; primary formation {well['formation']}.",
            f"Mud weight {well['mudWeight']:.2f} ppg against pore pressure {well['poreEmw']:.2f} ppg eq and "
            f"fracture gradient {well['fracEmw']:.2f} ppg eq.",
            f"Drilling parameters: {well['rpm']:.0f} rpm, {well['wob']:.1f} klbf WOB, {well['rop']:.1f} m/hr ROP, "
            f"{well['flowRate']:.0f} gpm, surface torque {well['torque']:.1f} kN·m.",
            f"Composite hazard score {risk['composite']:.0f}/100 ({risk['band']}); dominant hazard "
            f"{risk['worst']['label']} at {risk['worst']['probabilityPct']:.0f}% with "
            f"{risk['worst']['confidencePct']:.0f}% confidence.",
            "",
            "HAZARD PREDICTIONS AT THE BIT",
        ]
        for prediction in risk["predictions"]:
            lines.append(
                f"  - {prediction['label']}: {prediction['probabilityPct']:.0f}% "
                f"(confidence {prediction['confidencePct']:.0f}%, band {prediction['band']})"
            )
        lines.extend(["", "STRATIGRAPHY AHEAD"])
        for entry in context["directions"]:  # type: ignore[index]
            lines.append(
                f"  - {entry['formation']}: {entry['top']:.0f}-{entry['base']:.0f} m, pore "
                f"{entry['poreEmw']:.2f} ppg, frac {entry['fracEmw']:.2f} ppg, dominant hazard "
                f"{EVENT_LABELS.get(entry['primaryHazard'] or '', entry['primaryHazard'] or 'n/a')}"
            )
        lines.extend(["", "DEPTH BANDS AT HIGH RISK"])
        for band in context["criticalBands"]:  # type: ignore[index]
            lines.append(
                f"  - {band['depth']:.0f}-{band['depth'] + 100:.0f} m in {band['formation']}: "
                f"{band['band']} (weighted {band['weighted']:.0f}%)"
            )
        lines.extend(["", "MOST SIMILAR OFFSET WELLS"])
        for row in context["analogues"]:  # type: ignore[index]
            lines.append(
                f"  - {row['name']} ({row['field']}): {row['similarity']:.0f}% similar, "
                f"risk {row['riskBand']}, {row['criticalEventCount']} critical events, "
                f"{row['totalNptHours']:.0f} hr NPT"
            )
        lines.extend(["", "NEARBY WELLS"])
        for row in context["nearby"]:  # type: ignore[index]
            lines.append(
                f"  - {row['name']} at {row['distanceKm']:.1f} km, {row['status']}, formation "
                f"{row['formation']}, {row['eventCount']} events, risk {row['riskBand']}"
            )
        return "\n".join(lines)

    # -- generation ---------------------------------------------------------

    def build_messages(
        self,
        question: str,
        *,
        focus_well_id: Optional[str] = None,
        language: str = "en",
        history: Optional[List[dict]] = None,
    ) -> tuple[List[dict], Dict[str, object], str, List[dict]]:
        context = self.live_context(focus_well_id, language)
        evidence, hits = self.kb.context_block(question, focus_well_id=focus_well_id, k=7)

        messages: List[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.append(
            {
                "role": "system",
                "content": f"{self._context_text(context)}\n\nRETRIEVED EVIDENCE\n{evidence or '(no matching documents)'}",
            }
        )
        for turn in (history or [])[-6:]:
            role = turn.get("role")
            content = (turn.get("content") or "").strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": question})
        return messages, context, evidence, hits

    async def stream(
        self,
        question: str,
        *,
        focus_well_id: Optional[str] = None,
        language: str = "en",
        history: Optional[List[dict]] = None,
    ) -> AsyncIterator[dict]:
        messages, context, evidence, hits = self.build_messages(
            question, focus_well_id=focus_well_id, language=language, history=history
        )

        sources = [
            {
                "index": index,
                "docId": hit["docId"],
                "kind": hit["kind"],
                "title": hit["title"],
                "wellId": hit["wellId"],
                "score": hit["score"],
                "metadata": hit["metadata"],
            }
            for index, hit in enumerate(hits, start=1)
        ]

        yield {
            "type": "meta",
            "provider": self.settings.llm_status,
            "model": self.settings.groq_model if self.settings.llm_enabled else "drillmind-analytical",
            "focusWell": context["well"],
            "risk": context["risk"],
            "sources": sources,
            "evidence": hits,
        }

        if not self.settings.llm_enabled:
            for chunk in self._offline_answer(question, context, hits, language):
                yield {"type": "delta", "text": chunk}
            yield {"type": "done", "provider": "offline-analytical"}
            return

        try:
            async for chunk in self._groq_stream(messages):
                yield {"type": "delta", "text": chunk}
            yield {"type": "done", "provider": "groq", "model": self.settings.groq_model}
        except Exception as exc:  # noqa: BLE001 — degrade gracefully, never 500 mid-stream
            if not self.settings.allow_offline_copilot:
                yield {"type": "error", "message": f"LLM unavailable: {exc}"}
                yield {"type": "done", "provider": "error"}
                return
            yield {
                "type": "notice",
                "message": f"Groq unavailable ({type(exc).__name__}); answering from the local analytical engine.",
            }
            for chunk in self._offline_answer(question, context, hits, language):
                yield {"type": "delta", "text": chunk}
            yield {"type": "done", "provider": "offline-analytical"}

    async def _groq_stream(self, messages: List[dict]) -> AsyncIterator[str]:
        payload = {
            "model": self.settings.groq_model,
            "messages": messages,
            "temperature": 0.25,
            "top_p": 0.9,
            "max_tokens": 1200,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.settings.groq_base_url.rstrip('/')}/chat/completions"
        timeout = httpx.Timeout(connect=10.0, read=90.0, write=20.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code >= 400:
                    body = (await response.aread()).decode("utf-8", "replace")[:400]
                    raise RuntimeError(f"Groq HTTP {response.status_code}: {body}")
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = parsed.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    text = delta.get("content")
                    if text:
                        yield text

    async def complete(
        self,
        question: str,
        *,
        focus_well_id: Optional[str] = None,
        language: str = "en",
        max_tokens: int = 900,
    ) -> str:
        """Non-streaming completion (used by the report writer)."""
        messages, context, _, hits = self.build_messages(
            question, focus_well_id=focus_well_id, language=language
        )
        if not self.settings.llm_enabled:
            return "".join(self._offline_answer(question, context, hits, language))
        payload = {
            "model": self.settings.groq_model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.settings.groq_base_url.rstrip('/')}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception:  # noqa: BLE001
            return "".join(self._offline_answer(question, context, hits, language))

    # -- deterministic fallback --------------------------------------------

    def _offline_answer(
        self,
        question: str,
        context: Dict[str, object],
        hits: List[dict],
        language: str,
    ) -> List[str]:
        """Keyword-routed analytical answer built purely from the corpus."""
        well = context["well"]  # type: ignore[index]
        risk = context["risk"]  # type: ignore[index]
        tokens = question.lower()
        hindi = language == "hi"

        def emit(text: str) -> List[str]:
            # Stream word-by-word so the UI behaves identically to the LLM path.
            words = text.split(" ")
            return [word + " " for word in words]

        sections: List[str] = []

        def sec(title: str, lines: List[str]) -> None:
            sections.append(f"**{title}**\n" + "\n".join(f"- {line}" for line in lines) + "\n\n")

        if "torque" in tokens:
            drivers = risk["drivers"][:3]
            sec(
                "Torque assessment",
                [
                    f"Surface torque is {well['torque']:.1f} kN·m at {well['rpm']:.0f} rpm and {well['wob']:.1f} klbf WOB "
                    f"in the {well['formation']} at {well['currentDepthMd']:.0f} m.",
                    *[
                        f"{driver['label']} contributes {driver['impact']:+.2f} to the log-odds "
                        f"(normalised value {driver['value']:.2f}) — {driver['direction']} torsional load."
                        for driver in drivers
                    ],
                    "Reduce WOB in 15% steps and walk RPM off the torsional resonance before the next stand.",
                ],
            )
        if "mud loss" in tokens or "loss" in tokens or "4200" in tokens:
            losses = [
                event
                for event in self.corpus.events
                if event["type"] == "MUDFLOSS" and 3900.0 <= event["depth"] <= 4500.0
            ]
            losses.sort(key=lambda e: e["depth"])
            rows = []
            for event in losses[:5]:
                target = self.corpus.wells_by_id[event["wellId"]]
                rows.append(
                    f"{target['name']} ({target['field']}) lost circulation at {event['depth']:.0f} m in the "
                    f"{event['formation']} — {event['severity']} severity, {event['nptHours']:.1f} hr NPT. "
                    f"Mitigation: {event['mitigation']} ({event['outcome'].lower()})."
                )
            sec("Mud losses in the 3900-4500 m window", rows or ["No losses recorded in that window."])
        if "stuck" in tokens or "risk" in tokens or "formation" in tokens:
            sec(
                f"Hazards in the {well['formation']}",
                [
                    f"{prediction['label']}: {prediction['probabilityPct']:.0f}% probability "
                    f"({prediction['confidencePct']:.0f}% confidence, band {prediction['band']})"
                    for prediction in risk["predictions"]
                ],
            )
        if "similar" in tokens or "offset" in tokens or "analogue" in tokens:
            sec(
                "Closest offset wells",
                [
                    f"{row['name']} ({row['field']}) — {row['similarity']:.0f}% similar, risk {row['riskBand']}, "
                    f"{row['criticalEventCount']} critical events, {row['totalNptHours']:.0f} hr NPT"
                    for row in context["analogues"]  # type: ignore[index]
                ],
            )

        if not sections:
            sec(
                "Current picture",
                [
                    f"{well['name']} is at {well['currentDepthMd']:.0f} m in the {well['formation']}, "
                    f"mud weight {well['mudWeight']:.2f} ppg against a {well['poreEmw']:.2f} ppg pore pressure "
                    f"and {well['fracEmw']:.2f} ppg fracture gradient.",
                    f"Composite hazard score {risk['composite']:.0f}/100 ({risk['band']}); dominant hazard "
                    f"{risk['worst']['label']} at {risk['worst']['probabilityPct']:.0f}%.",
                    *[f"{prediction['label']}: {prediction['probabilityPct']:.0f}% ({prediction['band']})" for prediction in risk["predictions"]],
                ],
            )

        sec("Recommended actions", risk["actions"])
        if hits:
            sec(
                "Supporting documents",
                [f"[{index}] {hit['title']}" for index, hit in enumerate(hits[:5], start=1)],
            )

        header = (
            "**DrillMind analytical answer** (local engine — the LLM endpoint is not reachable)\n\n"
            if not hindi
            else "**ड्रिलमाइंड विश्लेषणात्मक उत्तर** (स्थानीय इंजन — एलएलएम उपलब्ध नहीं है)\n\n"
        )
        return emit(header + "".join(sections))

    def suggestion_list(self) -> List[dict]:
        return SUGGESTIONS


def hazard_label(hazard: str) -> str:
    return EVENT_LABELS.get(hazard, hazard)


def all_hazards() -> List[str]:
    return list(HAZARDS)
