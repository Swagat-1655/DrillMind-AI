"""Retrieval engine for the AI Drilling Copilot.

Builds a document corpus out of the platform's own data (well completion
reports, incident reports, end-of-well lessons, mud-logging summaries and
formation intelligence briefs) and indexes it with BM25.

This is an in-process, dependency-free stand-in for the ChromaDB vector store
named in the architecture: :func:`search` is the only entry point the copilot
uses, so swapping in a real embedding store later is a single-function change.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Dict, Iterable, List, Optional

TOKEN_RE = re.compile(r"[a-z0-9\.\-]+")

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "in", "to", "for", "on", "at", "is",
    "was", "were", "with", "by", "from", "as", "that", "this", "it", "be",
    "are", "has", "had", "have", "not", "but", "we", "our", "will", "can",
    "which", "into", "over", "after", "during", "when", "then", "than", "also",
    "there", "their", "its", "if", "so", "up", "out", "no", "well", "wells",
}


def tokenize(text: str) -> List[str]:
    return [
        token
        for token in TOKEN_RE.findall(text.lower())
        if token not in STOPWORDS and len(token) > 1
    ]


class Document:
    __slots__ = ("doc_id", "kind", "title", "text", "well_id", "metadata", "tokens")

    def __init__(
        self,
        doc_id: str,
        kind: str,
        title: str,
        text: str,
        well_id: Optional[str],
        metadata: Dict[str, object],
    ) -> None:
        self.doc_id = doc_id
        self.kind = kind
        self.title = title
        self.text = text
        self.well_id = well_id
        self.metadata = metadata
        self.tokens = tokenize(f"{title} {text}")


class BM25Index:
    """Classic Okapi BM25 over the in-memory document set."""

    def __init__(self, documents: List[Document], k1: float = 1.45, b: float = 0.72) -> None:
        self.documents = documents
        self.k1 = k1
        self.b = b
        self.term_frequencies: List[Counter] = [Counter(doc.tokens) for doc in documents]
        self.lengths = [len(doc.tokens) for doc in documents]
        self.avg_length = sum(self.lengths) / max(1, len(self.lengths))
        self.df: Counter = Counter()
        for tf in self.term_frequencies:
            for term in tf:
                self.df[term] += 1
        self.n = len(documents)

    def _idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        return math.log(1.0 + (self.n - df + 0.5) / (df + 0.5))

    def search(
        self,
        query: str,
        *,
        k: int = 6,
        kinds: Optional[Iterable[str]] = None,
        well_id: Optional[str] = None,
        boost_same_well: float = 1.25,
    ) -> List[dict]:
        terms = tokenize(query)
        if not terms:
            return []
        allowed = set(kinds) if kinds else None
        scored: List[tuple[float, int]] = []
        for index, tf in enumerate(self.term_frequencies):
            doc = self.documents[index]
            if allowed and doc.kind not in allowed:
                continue
            score = 0.0
            for term in terms:
                freq = tf.get(term, 0)
                if not freq:
                    continue
                norm = freq * (self.k1 + 1) / (
                    freq + self.k1 * (1 - self.b + self.b * self.lengths[index] / self.avg_length)
                )
                score += self._idf(term) * norm
            if score <= 0:
                continue
            if well_id and doc.well_id == well_id:
                score *= boost_same_well
            scored.append((score, index))
        scored.sort(reverse=True)
        results = []
        for score, index in scored[:k]:
            doc = self.documents[index]
            results.append(
                {
                    "docId": doc.doc_id,
                    "kind": doc.kind,
                    "title": doc.title,
                    "text": doc.text,
                    "wellId": doc.well_id,
                    "score": round(score, 4),
                    "metadata": doc.metadata,
                }
            )
        return results


# --------------------------------------------------------------------------
# Document construction
# --------------------------------------------------------------------------

KIND_LABELS = {
    "completion": "Well Completion Report",
    "incident": "Incident Report",
    "lesson": "Lessons Learned",
    "mudlog": "Mud Logging Summary",
    "formation": "Formation Intelligence Brief",
    "daily": "Daily Drilling Report",
}


def build_documents(corpus) -> List[Document]:
    documents: List[Document] = []

    for well in corpus.wells:
        formations = ", ".join(
            f"{entry['name']} ({entry['topMd']:.0f}-{entry['baseMd']:.0f} m)" for entry in well["formations"]
        )
        documents.append(
            Document(
                doc_id=f"CR-{well['id']}",
                kind="completion",
                title=f"Well Completion Report — {well['name']} ({well['field']})",
                text=(
                    f"{well['name']} was drilled by {well['operator']} in the {well['field']} field, "
                    f"{well['basin']} basin, {well['state']}. The well is a {well['wellType'].lower()} well "
                    f"spudded on {well['spudDate']}"
                    + (f" and completed on {well['completionDate']}" if well["completionDate"] else " and is currently drilling")
                    + f". Total depth is {well['totalDepthMd']:.0f} m MD with a primary target in the "
                    f"{well['formation']} ({well['lithology']}). Mud weight averaged {well['mudWeight']:.2f} ppg "
                    f"against a pore pressure of {well['poreEmw']:.2f} ppg equivalent and a fracture gradient of "
                    f"{well['fracEmw']:.2f} ppg, leaving a {well['fracMarginPpg']:.2f} ppg fracture margin. "
                    f"Formations penetrated: {formations}. "
                    f"{'The well is deviated with a kick-off at ' + format(well['kopMd'], '.0f') + ' m and a ' + format(well['targetInclination'], '.1f') + ' degree target inclination.' if well['isDeviated'] else 'The well is vertical.'} "
                    f"The well recorded {well['eventCount']} hazard events costing {well['totalNptHours']:.0f} hours "
                    f"of non-productive time and approximately USD {well['totalCostUsd']:,.0f}. "
                    f"Offset risk score is {well['riskScore']:.0f}/100 ({well['riskBand']})."
                ),
                well_id=well["id"],
                metadata={
                    "formation": well["formation"],
                    "basin": well["basin"],
                    "field": well["field"],
                    "riskBand": well["riskBand"],
                },
            )
        )

        for event in well["events"]:
            documents.append(
                Document(
                    doc_id=f"IR-{event['id']}",
                    kind="incident",
                    title=f"{event['label']} at {event['depth']:.0f} m — {well['name']} ({event['date'][:4]})",
                    text=(
                        f"On {event['date']} a {event['label'].lower()} occurred in the {well['name']} well "
                        f"while drilling the {event['formation']} at {event['depth']:.0f} m measured depth. "
                        f"Severity was assessed as {event['severity']}. Mud weight was raised from "
                        f"{event['mudWeightBefore']:.2f} ppg to {event['mudWeightAfter']:.2f} ppg as part of the "
                        f"response. The mitigation applied was: {event['mitigation']}. Outcome: {event['outcome']}. "
                        f"Non-productive time was {event['nptHours']:.1f} hours at an estimated cost of "
                        f"USD {event['costUsd']:,.0f}. The primary driver was the "
                        f"{well['formation']} pore pressure of {well['poreEmw']:.2f} ppg against a fracture "
                        f"gradient of {well['fracEmw']:.2f} ppg with mud weight at {event['mudWeightBefore']:.2f} ppg."
                    ),
                    well_id=well["id"],
                    metadata={
                        "type": event["type"],
                        "formation": event["formation"],
                        "depth": event["depth"],
                        "severity": event["severity"],
                        "outcome": event["outcome"],
                        "date": event["date"],
                    },
                )
            )

            documents.append(
                Document(
                    doc_id=f"DD-{event['id']}",
                    kind="daily",
                    title=f"Daily Drilling Report excerpt — {well['name']} {event['date']}",
                    text=(
                        f"06:00 hrs: drilling ahead in the {event['formation']} at {event['depth']:.0f} m with "
                        f"{event['mudWeightBefore']:.2f} ppg mud, {well['rpm']:.0f} rpm, {well['wob']:.1f} klbf and "
                        f"{well['rop']:.1f} m/hr ROP. Drill string torque was {well['torque']:.1f} kN·m and standpipe "
                        f"pressure {well['spp']:.0f} psi. "
                        f"Anomaly detected: {event['label']}. Action taken: {event['mitigation']}. "
                        f"The mud weight was adjusted to {event['mudWeightAfter']:.2f} ppg. "
                        f"{event['nptHours']:.1f} hours lost. Outcome {event['outcome']}."
                    ),
                    well_id=well["id"],
                    metadata={"type": event["type"], "formation": event["formation"], "depth": event["depth"]},
                )
            )

        for lesson in well["lessonsLearned"]:
            documents.append(
                Document(
                    doc_id=f"LL-{well['id']}-{lesson['eventType']}",
                    kind="lesson",
                    title=f"Lessons learned: {lesson['eventType']} in {well['name']}",
                    text=(
                        f"Lesson from {well['name']} ({well['field']}, {well['operator']}): a "
                        f"{lesson['severity'].lower()} severity {lesson['eventType']} was recorded in the "
                        f"{lesson['formation']} at {lesson['depth']:.0f} m costing {lesson['nptHours']:.1f} hours. "
                        f"The recommended mitigation for future wells is: {lesson['text']}. "
                        f"The recorded outcome was {lesson['outcome']}."
                    ),
                    well_id=well["id"],
                    metadata={"type": lesson["eventType"], "formation": lesson["formation"], "depth": lesson["depth"]},
                )
            )

        documents.append(
            Document(
                doc_id=f"ML-{well['id']}",
                kind="mudlog",
                title=f"Mud logging summary — {well['name']}",
                text=(
                    f"Mud logging surveillance on {well['name']} covered {well['totalDepthMd']:.0f} m of hole. "
                    f"Total gas background averaged {0.5 + 0.6 * well['hazardPressure']:.2f}% with connection gas "
                    f"peaks recorded in the {well['formation']}. Mud weight in averaged {well['mudWeight']:.2f} ppg "
                    f"and out averaged {well['mudWeight'] + 0.05:.2f} ppg. Lowest fracture margin was "
                    f"{well['fracMarginPpg']:.2f} ppg. Flow rate averaged {well['flowRate']:.0f} gpm with standpipe "
                    f"pressure {well['spp']:.0f} psi. {well['eventCount']} events were logged."
                ),
                well_id=well["id"],
                metadata={"formation": well["formation"]},
            )
        )

    from .formation_intel import formation_records

    for record in formation_records(corpus):
        documents.append(
            Document(
                doc_id=f"FI-{record['name']}",
                kind="formation",
                title=f"Formation intelligence brief — {record['name']}",
                text=record["summary"],
                well_id=None,
                metadata={
                    "formation": record["name"],
                    "basin": record["basin"],
                    "intelligenceScore": record["intelligenceScore"],
                    "eventCount": record["eventCount"],
                },
            )
        )

    return documents


class KnowledgeBase:
    """Queryable document store used by the copilot and the report writer."""

    def __init__(self, corpus) -> None:
        self.corpus = corpus
        self.documents = build_documents(corpus)
        self.index = BM25Index(self.documents)
        self.kinds = Counter(doc.kind for doc in self.documents)

    def search(
        self,
        query: str,
        *,
        k: int = 6,
        kinds: Optional[Iterable[str]] = None,
        well_id: Optional[str] = None,
    ) -> List[dict]:
        return self.index.search(query, k=k, kinds=kinds, well_id=well_id)

    def context_block(self, query: str, *, focus_well_id: Optional[str] = None, k: int = 7) -> tuple[str, List[dict]]:
        hits = self.search(query, k=k, well_id=focus_well_id)
        if not hits and focus_well_id:
            hits = self.search("hazard incident mitigation lesson", k=k, well_id=focus_well_id)
        lines = []
        for index, hit in enumerate(hits, start=1):
            lines.append(
                f"[{index}] ({KIND_LABELS.get(hit['kind'], hit['kind'])}) {hit['title']}\n{hit['text']}"
            )
        return "\n\n".join(lines), hits

    def stats(self) -> dict:
        return {
            "documents": len(self.documents),
            "byKind": {KIND_LABELS.get(kind, kind): count for kind, count in self.kinds.items()},
            "index": "BM25 (in-process; ChromaDB-compatible interface)",
            "vocabulary": len(self.index.df),
        }
