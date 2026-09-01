"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "Verified" | "Pending" | "Flagged";
type CaseStatus = "Active" | "Review" | "Closed";

type Evidence = {
  id: string;
  name: string;
  type: string;
  owner: string;
  status: Status;
  hash: string;
  size: string;
  registeredAt: string;
};

type CaseRecord = {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  priority: "High" | "Medium" | "Low";
  createdAt: string;
  updatedAt: string;
  lead: string;
  evidenceIds: string[];
};

const STORAGE_KEY = "evichain-prototype-v1";
const CASES_KEY = "evichain-cases-v1";

const defaultEvidence: Evidence[] = [
  {
    id: "EV-2048",
    name: "incident-video-042.mp4",
    type: "Video",
    owner: "Digital Forensics",
    status: "Verified",
    hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    size: "284 MB",
    registeredAt: "2026-08-25T09:14:00.000Z",
  },
  {
    id: "EV-2047",
    name: "system-logs.zip",
    type: "Archive",
    owner: "Security Operations",
    status: "Pending",
    hash: "60303ae22b9988610f0d7c0e8f7a5bb7c9e2af3b7f3f67c7aa7b2d7c4a10c1de",
    size: "18.4 MB",
    registeredAt: "2026-08-24T16:40:00.000Z",
  },
  {
    id: "EV-2046",
    name: "device-image.dd",
    type: "Disk image",
    owner: "Digital Forensics",
    status: "Flagged",
    hash: "1aa8c2e1d4f7b9a20f3c8e6d2b1a4c7e8f5d0c3b6a9e2f1d4c7b8a0e5f2d9c1",
    size: "1.2 TB",
    registeredAt: "2026-08-24T11:08:00.000Z",
  },
];

const defaultCases: CaseRecord[] = [
  {
    id: "CASE-2026-014",
    title: "Unauthorized access investigation",
    description:
      "Review of endpoint activity and recorded footage related to a suspected unauthorized access event.",
    status: "Active",
    priority: "High",
    createdAt: "2026-08-22T08:30:00.000Z",
    updatedAt: "2026-08-25T09:32:00.000Z",
    lead: "A. Sharma",
    evidenceIds: ["EV-2048", "EV-2047", "EV-2046"],
  },
  {
    id: "CASE-2026-013",
    title: "Vendor credential review",
    description:
      "Evidence package relating to third-party credential use and access policy compliance.",
    status: "Review",
    priority: "Medium",
    createdAt: "2026-08-18T11:15:00.000Z",
    updatedAt: "2026-08-23T14:20:00.000Z",
    lead: "R. Gupta",
    evidenceIds: [],
  },
  {
    id: "CASE-2026-009",
    title: "Archived policy dispute",
    description:
      "Closed evidence review concerning a previous access-control policy dispute.",
    status: "Closed",
    priority: "Low",
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-08-01T16:00:00.000Z",
    lead: "N. Verma",
    evidenceIds: [],
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortHash(hash: string) {
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

export default function CasePage() {
  const [evidence, setEvidence] = useState<Evidence[]>(defaultEvidence);
  const [caseRecords, setCaseRecords] =
    useState<CaseRecord[]>(defaultCases);
  const [selectedCaseId, setSelectedCaseId] = useState(defaultCases[0].id);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | CaseStatus>("All");
  const [notice, setNotice] = useState("Case intelligence workspace ready");

  useEffect(() => {
    const storedEvidence = window.localStorage.getItem(STORAGE_KEY);
    const storedCases = window.localStorage.getItem(CASES_KEY);

    if (storedEvidence) {
      try {
        const parsed = JSON.parse(storedEvidence) as {
          evidence?: Evidence[];
        };

        if (parsed.evidence?.length) {
          setEvidence(
            parsed.evidence.map((item) => ({
              id: item.id,
              name: item.name,
              type: item.type,
              owner: item.owner,
              status: item.status,
              hash: item.hash,
              size: item.size,
              registeredAt: item.registeredAt,
            })),
          );
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    if (storedCases) {
      try {
        const parsed = JSON.parse(storedCases) as CaseRecord[];

        if (parsed.length) {
          setCaseRecords(parsed);
        }
      } catch {
        window.localStorage.removeItem(CASES_KEY);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CASES_KEY, JSON.stringify(caseRecords));
  }, [caseRecords]);

  const visibleCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    return caseRecords.filter((item) => {
      const matchesSearch =
        !query ||
        `${item.id} ${item.title} ${item.description} ${item.lead}`
          .toLowerCase()
          .includes(query);

      const matchesFilter = filter === "All" || item.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [caseRecords, search, filter]);

  const selectedCase =
    caseRecords.find((item) => item.id === selectedCaseId) ??
    caseRecords[0];

  const linkedEvidence = evidence.filter((item) =>
    selectedCase.evidenceIds.includes(item.id),
  );

  const availableEvidence = evidence.filter(
    (item) => !selectedCase.evidenceIds.includes(item.id),
  );

  const verifiedCount = linkedEvidence.filter(
    (item) => item.status === "Verified",
  ).length;

  const pendingCount = linkedEvidence.filter(
    (item) => item.status === "Pending",
  ).length;

  const flaggedCount = linkedEvidence.filter(
    (item) => item.status === "Flagged",
  ).length;

  function linkEvidence() {
    if (!selectedEvidenceId) {
      setNotice("Choose an evidence record to link.");
      return;
    }

    if (selectedCase.evidenceIds.includes(selectedEvidenceId)) {
      setNotice("This evidence is already linked to the case.");
      return;
    }

    const selectedEvidence = evidence.find(
      (item) => item.id === selectedEvidenceId,
    );

    setCaseRecords((items) =>
      items.map((item) =>
        item.id === selectedCase.id
          ? {
              ...item,
              evidenceIds: [...item.evidenceIds, selectedEvidenceId],
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );

    setSelectedEvidenceId("");
    setNotice(
      `${selectedEvidence?.id ?? "Evidence"} linked to ${selectedCase.id}.`,
    );
  }

  function unlinkEvidence(evidenceId: string) {
    setCaseRecords((items) =>
      items.map((item) =>
        item.id === selectedCase.id
          ? {
              ...item,
              evidenceIds: item.evidenceIds.filter(
                (id) => id !== evidenceId,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );

    setNotice(`${evidenceId} removed from this case.`);
  }

  function exportPack() {
    const payload = {
      product: "EviChain",
      generatedAt: new Date().toISOString(),
      case: selectedCase,
      evidence: linkedEvidence,
      integrity: {
        total: linkedEvidence.length,
        verified: verifiedCount,
        pending: pendingCount,
        flagged: flaggedCount,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${selectedCase.id.toLowerCase()}-evidence-pack.json`;
    link.click();

    URL.revokeObjectURL(url);
    setNotice("Evidence pack generated.");
  }

  return (
    <main className="case-shell">
      <header className="case-topbar">
        <a className="case-brand" href="/">
          <span className="brand-mark">E</span>
          <span>
            <strong>EviChain</strong>
            <small>Case intelligence workspace</small>
          </span>
        </a>

        <nav className="case-nav">
  <a href="/">Dashboard</a>
  <a href="/verify">Verify portal</a>
  <a href="/case">Case intelligence</a>

  <span className="secure-status">
    <span className="status-dot" />
    Secure workspace
  </span>
</nav>
      </header>

      <section className="case-hero">
        <div>
          <p className="eyebrow">CASE INTELLIGENCE / PRESENTATION VIEW</p>
          <h1>Turn evidence into a defensible case.</h1>
          <p>
            Organize related evidence, surface integrity risks, and export a
            review-ready evidence pack.
          </p>
        </div>

        <button className="button button-primary" onClick={exportPack} suppressHydrationWarning>
          Generate evidence pack ↓
        </button>
      </section>

      <section className="case-layout">
        <aside className="case-list-panel">
          <div className="case-list-heading">
            <div>
              <p className="eyebrow">CASE REGISTER</p>
              <h2>Investigations</h2>
            </div>
            <span>{visibleCases.length}</span>
          </div>

          <div className="case-filters">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases…"
              suppressHydrationWarning
            />

            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as "All" | CaseStatus)
              }
              suppressHydrationWarning
            >
              <option>All</option>
              <option>Active</option>
              <option>Review</option>
              <option>Closed</option>
            </select>
          </div>

          <div className="case-list">
            {visibleCases.map((item) => (
              <button
                className={`case-list-item ${
                  selectedCase.id === item.id ? "selected" : ""
                }`}
                key={item.id}
                onClick={() => setSelectedCaseId(item.id)}
                suppressHydrationWarning
              >
                <div>
                  <small>{item.id}</small>
                  <strong>{item.title}</strong>
                </div>

                <span className={`case-status ${item.status.toLowerCase()}`}>
                  {item.status}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="case-detail-panel">
          <div className="case-detail-header">
            <div>
              <div className="case-id-row">
                <p className="eyebrow">{selectedCase.id}</p>
                <button
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(selectedCase.id)
                      .then(() => setNotice("Case ID copied."))
                  }
                  suppressHydrationWarning
                >
                  Copy ID
                </button>
              </div>

              <h2>{selectedCase.title}</h2>
              <p>{selectedCase.description}</p>
            </div>

            <div className="case-badges">
              <span
                className={`case-status ${selectedCase.status.toLowerCase()}`}
              >
                {selectedCase.status}
              </span>

              <span
                className={`priority ${selectedCase.priority.toLowerCase()}`}
              >
                {selectedCase.priority} priority
              </span>
            </div>
          </div>

          <div className="case-meta">
            <div>
              <span>CASE LEAD</span>
              <strong>{selectedCase.lead}</strong>
            </div>

            <div>
              <span>CREATED</span>
              <strong>{formatDate(selectedCase.createdAt)}</strong>
            </div>

            <div>
              <span>LAST UPDATED</span>
              <strong>{formatDate(selectedCase.updatedAt)}</strong>
            </div>
          </div>

          <div className="integrity-summary">
            <div>
              <span>Total evidence</span>
              <strong>{linkedEvidence.length}</strong>
            </div>

            <div className="summary-green">
              <span>Verified</span>
              <strong>{verifiedCount}</strong>
            </div>

            <div className="summary-amber">
              <span>Pending</span>
              <strong>{pendingCount}</strong>
            </div>

            <div className="summary-red">
              <span>Flagged</span>
              <strong>{flaggedCount}</strong>
            </div>
          </div>

          <div className="link-evidence-card">
            <div>
              <p className="eyebrow">CASE ASSOCIATION</p>
              <h3>Link evidence to this case</h3>
              <p>
                Associate registry records with the investigation to create a
                complete evidence pack.
              </p>
            </div>

            <div className="link-controls">
              <select
                value={selectedEvidenceId}
                onChange={(event) =>
                  setSelectedEvidenceId(event.target.value)
                }
                suppressHydrationWarning
              >
                <option value="">Select evidence…</option>
                {availableEvidence.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.id} · {item.name}
                  </option>
                ))}
              </select>

              <button
                className="button button-primary small-button"
                onClick={linkEvidence}
                disabled={!availableEvidence.length}
                suppressHydrationWarning
              >
                Link record
              </button>
            </div>
          </div>

          <div className="case-evidence-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LINKED RECORDS</p>
                <h3>Evidence in this case</h3>
              </div>
              <span>{linkedEvidence.length} records</span>
            </div>

            {linkedEvidence.length === 0 ? (
              <div className="case-empty">
                <strong>No evidence linked yet.</strong>
                <p>
                  Use the association control above to attach a registry
                  record.
                </p>
              </div>
            ) : (
              <div className="case-evidence-list">
                {linkedEvidence.map((item) => (
                  <article className="case-evidence-row" key={item.id}>
                    <div className="case-evidence-icon">◈</div>

                    <div className="case-evidence-main">
                      <strong>{item.name}</strong>
                      <small>
                        {item.id} · {item.type} · {item.owner}
                      </small>
                      <code>{shortHash(item.hash)}</code>
                    </div>

                    <div className="case-evidence-right">
                      <span className={`status ${item.status.toLowerCase()}`}>
                        <span />
                        {item.status}
                      </span>

                      <button
                        className="unlink-button"
                        onClick={() => unlinkEvidence(item.id)}
                        suppressHydrationWarning
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="presentation-note">
            <span className="note-icon">✦</span>
            <div>
              <strong>Presentation insight</strong>
              <p>
                {flaggedCount > 0
                  ? `${flaggedCount} flagged record blocks a clean case closure.`
                  : "No integrity risk currently blocks case review."}
              </p>
            </div>
          </div>
        </section>
      </section>

      <footer className="case-footer">
        <span>● {notice}</span>
        <span>EviChain prototype · Case intelligence module</span>
      </footer>
    </main>
  );
}