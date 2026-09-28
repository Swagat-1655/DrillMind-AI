"""Drilling Intelligence Report generator.

Produces one structured report payload used by three outputs:

* ``.docx``  — a real OOXML package assembled with the standard library only
  (no python-docx dependency), so the backend stays installable anywhere.
* ``.html``  — a print-optimised sheet; the browser's "Save as PDF" produces
  the PDF deliverable with correct page breaks and styling.
* ``.json``  — the raw payload, for the API and for downstream automation.
"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone
from html import escape
from typing import Dict, List, Optional

from ..data import EVENT_LABELS, HAZARDS
from .analytics import nearby_wells
from .formation_intel import formation_records
from .knowledge import institutional_memory
from .risk import depth_profile, upcoming_windows, well_risk_summary
from .similarity import similar_wells


def build_report(corpus, well: dict, narrative: Optional[str] = None) -> Dict[str, object]:
    risk = well_risk_summary(corpus, well)
    profile = depth_profile(corpus, well)
    windows = upcoming_windows(corpus, well)
    analogue = similar_wells(corpus, well, limit=6)[1:]
    nearby = nearby_wells(corpus, well, radius_km=15.0, limit=10)
    memory = institutional_memory(corpus, well)
    records = {record["name"]: record for record in formation_records(corpus)}

    formation_rows = []
    for entry in well["formations"]:
        record = records.get(entry["name"], {})
        primary = record.get("primaryHazard") or {}
        formation_rows.append(
            {
                "formation": entry["name"],
                "interval": f"{entry['topMd']:.0f}-{entry['baseMd']:.0f} m",
                "lithology": entry["lithology"],
                "reservoir": entry["reservoir"],
                "poreEmw": entry["poreEmw"],
                "fracEmw": entry["fracEmw"],
                "primaryHazard": EVENT_LABELS.get(entry["primaryHazard"] or "", "—"),
                "window": (
                    f"{primary.get('low', 0):.0f}-{primary.get('high', 0):.0f} m"
                    if primary
                    else "—"
                ),
                "events": record.get("eventCount", 0),
                "intelligence": record.get("intelligenceScore", 0),
                "headline": record.get("headline", ""),
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "preparedBy": "DrillMind AI — Nearby Wells Intelligence System (NWIS)",
        "reportId": f"DMR-{well['id']}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}",
        "well": {
            "id": well["id"],
            "name": well["name"],
            "field": well["field"],
            "basin": well["basin"],
            "state": well["state"],
            "operator": well["operator"],
            "status": well["status"],
            "wellType": well["wellType"],
            "spudDate": well["spudDate"],
            "completionDate": well["completionDate"],
            "lat": well["lat"],
            "lon": well["lon"],
            "totalDepthMd": well["totalDepthMd"],
            "currentDepthMd": well["currentDepthMd"],
            "formation": well["formation"],
            "reservoir": well["reservoir"],
            "lithology": well["lithology"],
            "mudWeight": well["mudWeight"],
            "poreEmw": well["poreEmw"],
            "fracEmw": well["fracEmw"],
            "rpm": well["rpm"],
            "wob": well["wob"],
            "rop": well["rop"],
            "flowRate": well["flowRate"],
            "torque": well["torque"],
            "bottomHoleTempC": well["bottomHoleTempC"],
            "riskScore": well["riskScore"],
            "riskBand": well["riskBand"],
        },
        "narrative": narrative or "",
        "risk": risk,
        "windows": windows,
        "formations": formation_rows,
        "nearbyWells": nearby,
        "similarWells": analogue,
        "predictedRisks": risk["predictions"],
        "criticalBands": [band for band in profile["bands"] if band["band"] in {"CRITICAL", "HIGH"}][:8],
        "recommendations": risk["actions"],
        "memory": memory,
        "evidence": memory["evidenceSample"],
        "totals": {
            "nearbyEvents": sum(row["eventCount"] for row in nearby),
            "nearbyNptHours": round(sum(corpus.wells_by_id[row["id"]]["totalNptHours"] for row in nearby), 1),
            "analogueNptHours": round(sum(row["totalNptHours"] for row in analogue), 1),
        },
    }


# --------------------------------------------------------------------------
# DOCX (OOXML) writer — standard library only
# --------------------------------------------------------------------------

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Inter" w:hAnsi="Inter"/><w:sz w:val="20"/><w:color w:val="1B2430"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="0B3C5D"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:pPr><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="0E7490"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="B45309"/></w:rPr>
  </w:style>
</w:styles>"""


def _xml(text: str) -> str:
    return escape(str(text), quote=False)


def _para(text: str, style: Optional[str] = None, bold: bool = False) -> str:
    props = f'<w:pPr><w:pStyle w:val="{style}"/><w:spacing w:after="90"/></w:pPr>' if style else '<w:pPr><w:spacing w:after="90"/></w:pPr>'
    run_props = "<w:rPr><w:b/></w:rPr>" if bold else ""
    # Preserve intentional line breaks inside a paragraph.
    pieces = str(text).split("\n")
    runs = []
    for index, piece in enumerate(pieces):
        if index:
            runs.append("<w:r><w:br/></w:r>")
        runs.append(f'<w:r>{run_props}<w:t xml:space="preserve">{_xml(piece)}</w:t></w:r>')
    return f"<w:p>{props}{''.join(runs)}</w:p>"


def _bullets(items: List[str]) -> str:
    return "".join(
        f'<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="340" w:hanging="200"/></w:pPr>'
        f'<w:r><w:t xml:space="preserve">• {_xml(item)}</w:t></w:r></w:p>'
        for item in items
    )


def _table(header: List[str], rows: List[List[str]], widths: Optional[List[int]] = None) -> str:
    widths = widths or [2400] * len(header)
    grid = "".join(f'<w:gridCol w:w="{width}"/>' for width in widths)

    def cell(value: str, bold: bool = False, shade: Optional[str] = None) -> str:
        shading = f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>' if shade else ""
        run = f'<w:rPr><w:b/></w:rPr>' if bold else ""
        return (
            f'<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/>{shading}</w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>'
            f'<w:r>{run}<w:t xml:space="preserve">{_xml(value)}</w:t></w:r></w:p></w:tc>'
        )

    head = "<w:tr>" + "".join(cell(value, bold=True, shade="E8F4F8") for value in header) + "</w:tr>"
    body = "".join(
        "<w:tr>" + "".join(cell(str(value)) for value in row) + "</w:tr>" for row in rows
    )
    borders = (
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:color="C7D2DA"/>'
        '<w:left w:val="single" w:sz="4" w:color="C7D2DA"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="C7D2DA"/>'
        '<w:right w:val="single" w:sz="4" w:color="C7D2DA"/>'
        '<w:insideH w:val="single" w:sz="4" w:color="DCE5EA"/>'
        '<w:insideV w:val="single" w:sz="4" w:color="DCE5EA"/>'
        "</w:tblBorders>"
    )
    return (
        "<w:tbl><w:tblPr>"
        '<w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>'
        f"{borders}</w:tblPr>"
        f"<w:tblGrid>{grid}</w:tblGrid>{head}{body}</w:tbl>"
    )


def render_docx(report: Dict[str, object]) -> bytes:
    well = report["well"]  # type: ignore[index]
    risk = report["risk"]  # type: ignore[index]
    body: List[str] = []

    body.append(_para("DrillMind AI", "Title"))
    body.append(_para("Drilling Intelligence Report — Nearby Wells Analysis", "Heading1"))
    body.append(
        _para(
            f"Report ID {report['reportId']} · generated {report['generatedAt']} · "
            f"{report['preparedBy']}"
        )
    )

    body.append(_para("1. Active Well Summary", "Heading1"))
    body.append(
        _table(
            ["Attribute", "Value", "Attribute", "Value"],
            [
                ["Well", well["name"], "Well ID", well["id"]],
                ["Field", f"{well['field']} ({well['basin']})", "Operator", well["operator"]],
                ["Status", well["status"], "Well type", well["wellType"]],
                ["Spud date", well["spudDate"], "Completion", well["completionDate"] or "drilling"],
                ["Coordinates", f"{well['lat']:.4f}, {well['lon']:.4f}", "State", well["state"]],
                ["Current depth", f"{well['currentDepthMd']:.0f} m MD", "Total depth", f"{well['totalDepthMd']:.0f} m MD"],
                ["Primary formation", well["formation"], "Reservoir", well["reservoir"]],
                ["Mud weight", f"{well['mudWeight']:.2f} ppg", "Pore pressure", f"{well['poreEmw']:.2f} ppg eq"],
                ["Fracture gradient", f"{well['fracEmw']:.2f} ppg eq", "BHT", f"{well['bottomHoleTempC']:.0f} °C"],
                ["ROP / RPM / WOB", f"{well['rop']:.1f} m/hr · {well['rpm']:.0f} rpm · {well['wob']:.1f} klbf", "Flow rate", f"{well['flowRate']:.0f} gpm"],
                ["Offset risk score", f"{well['riskScore']:.0f}/100 ({well['riskBand']})", "Composite hazard", f"{risk['composite']:.0f}% ({risk['band']})"],
            ],
        )
    )

    if report.get("narrative"):
        body.append(_para("2. AI Executive Summary", "Heading1"))
        for paragraph in str(report["narrative"]).split("\n\n"):
            body.append(_para(paragraph.strip()))

    body.append(_para("3. Forward Hazard Predictions", "Heading1"))
    body.append(
        _table(
            ["Hazard", "Probability", "Confidence", "Band", "Primary driver"],
            [
                [
                    prediction["label"],
                    f"{prediction['probabilityPct']:.0f}%",
                    f"{prediction['confidencePct']:.0f}%",
                    prediction["band"],
                    (prediction.get("topDriver") or {}).get("label", "—"),
                ]
                for prediction in risk["predictions"]
            ],
        )
    )

    body.append(_para("4. Prediction Windows", "Heading1"))
    for window in report["windows"]:  # type: ignore[index]
        worst = window["worst"]
        body.append(_para(f"{window['label']} — {window['depth']:.0f} m MD", "Heading2"))
        body.append(
            _para(
                f"Dominant hazard: {worst['label']} at {worst['probabilityPct']:.0f}% "
                f"(confidence {worst['confidencePct']:.0f}%, band {worst['band']})."
            )
        )
        body.append(
            _bullets(
                [
                    f"{p['label']}: {p['probabilityPct']:.0f}% ({p['band']})"
                    for p in window["predictions"]
                ]
            )
        )

    body.append(_para("5. Formation Risk Analysis", "Heading1"))
    body.append(
        _table(
            ["Formation", "Interval", "Pore (ppg)", "Frac (ppg)", "Primary hazard", "Hazard window", "Events", "Intel."],
            [
                [
                    row["formation"],
                    row["interval"],
                    f"{row['poreEmw']:.2f}",
                    f"{row['fracEmw']:.2f}",
                    row["primaryHazard"],
                    row["window"],
                    str(row["events"]),
                    f"{row['intelligence']:.0f}%",
                ]
                for row in report["formations"]  # type: ignore[index]
            ],
        )
    )
    for row in report["formations"]:  # type: ignore[index]
        if row.get("headline"):
            body.append(_para(f"{row['formation']}: {row['headline']}"))

    body.append(_para("6. Nearby Wells Analysis", "Heading1"))
    body.append(
        _table(
            ["Well", "Field", "Distance", "Status", "Formation", "Events", "Risk"],
            [
                [
                    row["name"],
                    row["field"],
                    f"{row['distanceKm']:.1f} km",
                    row["status"],
                    row["formation"],
                    str(row["eventCount"]),
                    f"{row['riskScore']:.0f} ({row['riskBand']})",
                ]
                for row in report["nearbyWells"]  # type: ignore[index]
            ],
        )
    )

    body.append(_para("7. Similar Wells (AI Similarity Engine)", "Heading1"))
    body.append(
        _table(
            ["Well", "Field", "Similarity", "Distance", "Formation", "Critical events", "NPT (hr)"],
            [
                [
                    row["name"],
                    row["field"],
                    f"{row['similarity']:.0f}%",
                    f"{row['distanceKm']:.1f} km",
                    row["formation"],
                    str(row["criticalEventCount"]),
                    f"{row['totalNptHours']:.0f}",
                ]
                for row in report["similarWells"]  # type: ignore[index]
            ],
        )
    )

    body.append(_para("8. High-Risk Depth Bands", "Heading1"))
    body.append(
        _table(
            ["Depth band", "Formation", "Band", "Weighted score"],
            [
                [
                    f"{band['depth']:.0f}-{band['depth'] + 100:.0f} m",
                    band["formation"],
                    band["band"],
                    f"{band['weighted']:.0f}%",
                ]
                for band in report["criticalBands"]  # type: ignore[index]
            ],
        )
    )

    body.append(_para("9. Recommendations", "Heading1"))
    body.append(_bullets([str(item) for item in report["recommendations"]]))  # type: ignore[index]

    body.append(_para("10. Institutional Memory", "Heading1"))
    memory = report["memory"]  # type: ignore[index]
    body.append(_para(str(memory["narrative"])))
    body.append(
        _table(
            ["Metric", "Value"],
            [[metric["label"], f"{metric['value']} {metric['unit']}"] for metric in memory["metrics"]],
        )
    )

    body.append(_para("11. Supporting Evidence", "Heading1"))
    body.append(
        _table(
            ["Date", "Well", "Event", "Formation", "Depth", "Severity", "Mitigation", "Outcome"],
            [
                [
                    row["date"],
                    row["wellName"],
                    row["label"],
                    row["formation"],
                    f"{row['depth']:.0f} m",
                    row["severity"],
                    row["mitigation"],
                    row["outcome"],
                ]
                for row in report["evidence"]  # type: ignore[index]
            ],
        )
    )

    body.append(
        _para(
            "Generated by DrillMind AI · Nearby Wells Intelligence System · Smart India Hackathon 2026. "
            "Predictions are decision support, not a substitute for the well programme and the drilling supervisor's judgement.",
            bold=False,
        )
    )

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>" + "".join(body) + "</w:body></w:document>"
    )

    core = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">'
        f"<dc:title>Drilling Intelligence Report — {_xml(well['name'])}</dc:title>"
        "<dc:creator>DrillMind AI</dc:creator>"
        f"<dc:subject>{_xml(well['field'])} · {_xml(well['basin'])}</dc:subject>"
        "</cp:coreProperties>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", ROOT_RELS)
        archive.writestr("word/_rels/document.xml.rels", DOC_RELS)
        archive.writestr("word/styles.xml", STYLES)
        archive.writestr("word/document.xml", document)
        archive.writestr("docProps/core.xml", core)
    return buffer.getvalue()


# --------------------------------------------------------------------------
# Print-ready HTML
# --------------------------------------------------------------------------


def render_html(report: Dict[str, object]) -> str:
    well = report["well"]  # type: ignore[index]
    risk = report["risk"]  # type: ignore[index]
    memory = report["memory"]  # type: ignore[index]

    def table(header: List[str], rows: List[List[str]], klass: str = "") -> str:
        head = "".join(f"<th>{escape(str(value))}</th>" for value in header)
        body = "".join(
            "<tr>" + "".join(f"<td>{escape(str(value))}</td>" for value in row) + "</tr>"
            for row in rows
        )
        return f'<table class="{klass}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'

    def band_chip(band: str) -> str:
        return f'<span class="chip chip-{band.lower()}">{escape(band)}</span>'

    sections = []
    sections.append(
        f"<h1>Drilling Intelligence Report</h1>"
        f"<p class='meta'>Report {escape(str(report['reportId']))} · generated {escape(str(report['generatedAt']))} · "
        f"{escape(str(report['preparedBy']))}</p>"
    )

    sections.append("<h2>1. Active Well Summary</h2>")
    sections.append(
        table(
            ["Attribute", "Value", "Attribute", "Value"],
            [
                ["Well", well["name"], "Well ID", well["id"]],
                ["Field", f"{well['field']} ({well['basin']})", "Operator", well["operator"]],
                ["Status", well["status"], "Well type", well["wellType"]],
                ["Spud date", well["spudDate"], "Completion", well["completionDate"] or "drilling"],
                ["Coordinates", f"{well['lat']:.4f}, {well['lon']:.4f}", "State", well["state"]],
                ["Current depth", f"{well['currentDepthMd']:.0f} m MD", "Total depth", f"{well['totalDepthMd']:.0f} m MD"],
                ["Primary formation", well["formation"], "Reservoir", well["reservoir"]],
                ["Mud weight", f"{well['mudWeight']:.2f} ppg", "Pore pressure", f"{well['poreEmw']:.2f} ppg eq"],
                ["Fracture gradient", f"{well['fracEmw']:.2f} ppg eq", "BHT", f"{well['bottomHoleTempC']:.0f} °C"],
                ["Offset risk", f"{well['riskScore']:.0f}/100 ({well['riskBand']})", "Composite hazard", f"{risk['composite']:.0f}%"],
            ],
        )
    )

    if report.get("narrative"):
        sections.append("<h2>2. AI Executive Summary</h2>")
        for paragraph in str(report["narrative"]).split("\n\n"):
            sections.append(f"<p>{escape(paragraph.strip())}</p>")

    sections.append("<h2>3. Forward Hazard Predictions</h2>")
    sections.append(
        table(
            ["Hazard", "Probability", "Confidence", "Band", "Primary driver"],
            [
                [
                    prediction["label"],
                    f"{prediction['probabilityPct']:.0f}%",
                    f"{prediction['confidencePct']:.0f}%",
                    band_chip(prediction["band"]),
                    (prediction.get("topDriver") or {}).get("label", "—"),
                ]
                for prediction in risk["predictions"]
            ],
        )
    )

    sections.append("<h2>4. Formation Risk Analysis</h2>")
    sections.append(
        table(
            ["Formation", "Interval", "Pore", "Frac", "Primary hazard", "Hazard window", "Events", "Intel."],
            [
                [
                    row["formation"],
                    row["interval"],
                    f"{row['poreEmw']:.2f}",
                    f"{row['fracEmw']:.2f}",
                    row["primaryHazard"],
                    row["window"],
                    row["events"],
                    f"{row['intelligence']:.0f}%",
                ]
                for row in report["formations"]  # type: ignore[index]
            ],
        )
    )

    sections.append("<h2>5. Nearby Wells Analysis</h2>")
    sections.append(
        table(
            ["Well", "Field", "Distance", "Status", "Formation", "Events", "Risk"],
            [
                [
                    row["name"],
                    row["field"],
                    f"{row['distanceKm']:.1f} km",
                    row["status"],
                    row["formation"],
                    row["eventCount"],
                    f"{row['riskScore']:.0f} ({row['riskBand']})",
                ]
                for row in report["nearbyWells"]  # type: ignore[index]
            ],
        )
    )

    sections.append("<h2>6. Similar Wells</h2>")
    sections.append(
        table(
            ["Well", "Field", "Similarity", "Distance", "Critical events", "NPT (hr)"],
            [
                [
                    row["name"],
                    row["field"],
                    f"{row['similarity']:.0f}%",
                    f"{row['distanceKm']:.1f} km",
                    row["criticalEventCount"],
                    f"{row['totalNptHours']:.0f}",
                ]
                for row in report["similarWells"]  # type: ignore[index]
            ],
        )
    )

    sections.append("<h2>7. High-Risk Depth Bands</h2>")
    sections.append(
        table(
            ["Depth band", "Formation", "Band", "Weighted score"],
            [
                [
                    f"{band['depth']:.0f}-{band['depth'] + 100:.0f} m",
                    band["formation"],
                    band_chip(band["band"]),
                    f"{band['weighted']:.0f}%",
                ]
                for band in report["criticalBands"]  # type: ignore[index]
            ],
        )
    )

    sections.append("<h2>8. Recommendations</h2><ul>")
    sections.extend(f"<li>{escape(str(item))}</li>" for item in report["recommendations"])  # type: ignore[index]
    sections.append("</ul>")

    sections.append("<h2>9. Institutional Memory</h2>")
    sections.append(f"<p>{escape(str(memory['narrative']))}</p>")
    sections.append(
        table(
            ["Metric", "Value"],
            [[metric["label"], f"{metric['value']} {metric['unit']}"] for metric in memory["metrics"]],
        )
    )

    sections.append("<h2>10. Supporting Evidence</h2>")
    sections.append(
        table(
            ["Date", "Well", "Event", "Formation", "Depth", "Severity", "Mitigation", "Outcome"],
            [
                [
                    row["date"],
                    row["wellName"],
                    row["label"],
                    row["formation"],
                    f"{row['depth']:.0f} m",
                    row["severity"],
                    row["mitigation"],
                    row["outcome"],
                ]
                for row in report["evidence"]  # type: ignore[index]
            ],
        )
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Drilling Intelligence Report — {escape(str(well['name']))}</title>
<style>
  @page {{ size: A4; margin: 16mm 14mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: Inter, 'Segoe UI', system-ui, sans-serif; color: #16202b; margin: 0;
         padding: 32px; background: #fff; font-size: 12px; line-height: 1.55; }}
  h1 {{ font-size: 26px; color: #0b3c5d; margin: 0 0 6px; letter-spacing: -0.02em; }}
  h2 {{ font-size: 15px; color: #0e7490; margin: 26px 0 10px; padding-bottom: 5px;
        border-bottom: 2px solid #d8e6ee; page-break-after: avoid; }}
  .meta {{ color: #5b6b7a; margin: 0 0 8px; font-size: 11px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 8px 0 16px; page-break-inside: auto; }}
  th {{ background: #eaf5f9; color: #0b3c5d; text-align: left; font-size: 10.5px;
        text-transform: uppercase; letter-spacing: .04em; }}
  th, td {{ border: 1px solid #d5e1e8; padding: 6px 8px; vertical-align: top; }}
  tr {{ page-break-inside: avoid; }}
  tbody tr:nth-child(even) {{ background: #f7fbfd; }}
  ul {{ padding-left: 18px; }}
  li {{ margin-bottom: 5px; }}
  .chip {{ display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px;
           font-weight: 700; letter-spacing: .04em; }}
  .chip-low {{ background: #dcf5e8; color: #0b6b41; }}
  .chip-moderate {{ background: #fdf0d5; color: #8a5a09; }}
  .chip-high {{ background: #ffe6d0; color: #9a3412; }}
  .chip-critical {{ background: #ffdcdc; color: #991b1b; }}
  .foot {{ margin-top: 24px; padding-top: 12px; border-top: 1px solid #d8e6ee; color: #6b7a88; font-size: 10.5px; }}
  @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
</style></head>
<body>
<div class="no-print" style="text-align:right;margin-bottom:14px">
  <button onclick="window.print()" style="background:#0e7490;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer">
    Print / Save as PDF
  </button>
</div>
{''.join(sections)}
<p class="foot">Generated by DrillMind AI · Nearby Wells Intelligence System · Smart India Hackathon 2026.
Predictions are decision support, not a substitute for the well programme and the drilling supervisor's judgement.</p>
</body></html>"""


def hazard_columns() -> List[str]:
    return list(HAZARDS)
