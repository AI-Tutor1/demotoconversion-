"use client";

import { MUTED, NEAR_BLACK, BLUE, type Demo } from "@/lib/types";

interface SalesFeedbackReportProps {
  demo: Demo;
}

const YES = "#30D158";
const NO = "#E24B4A";

function YesNoDisplay({ value }: { value: boolean | null }) {
  if (value === null) {
    return (
      <span style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>
        Not answered
      </span>
    );
  }
  const color = value ? YES : NO;
  return (
    <span
      style={{
        padding: "3px 12px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 980,
        background: color,
        color: "#fff",
      }}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

function QCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e8e8ed",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 12,
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: NEAR_BLACK,
          lineHeight: 1.47,
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function CommentBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p
      style={{
        fontSize: 13,
        color: NEAR_BLACK,
        lineHeight: 1.5,
        marginTop: 10,
        padding: "8px 12px",
        background: "#f5f5f7",
        borderRadius: 8,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </p>
  );
}

export default function SalesFeedbackReport({ demo }: SalesFeedbackReportProps) {
  const hasAnyAnswer =
    demo.feedbackRating > 0 ||
    demo.feedbackExplanation !== null ||
    demo.feedbackParticipation !== null ||
    demo.feedbackConfused !== null ||
    demo.feedbackUncomfortable !== null ||
    demo.feedbackPositiveEnv !== null ||
    demo.feedbackSuggestions.trim() !== "" ||
    demo.feedbackComments.trim() !== "";

  const statusBg =
    demo.status === "Converted"
      ? "#E8F5E9"
      : demo.status === "Not Converted"
      ? "#FFEBEE"
      : "#FFF8E1";
  const statusFg =
    demo.status === "Converted"
      ? "#1B5E20"
      : demo.status === "Not Converted"
      ? "#B71C1C"
      : "#8B6914";

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ maxWidth: 640 }}>
        <div className="section-label" style={{ marginBottom: 6 }}>
          Sales feedback
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          Follow-up &amp; conversion
          <span
            style={{
              padding: "3px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 980,
              background: statusBg,
              color: statusFg,
            }}
          >
            {demo.status}
          </span>
        </h2>

        {!hasAnyAnswer ? (
          <div
            style={{
              background: "#fff",
              border: "1px dashed #e8e8ed",
              borderRadius: 12,
              padding: "24px 18px",
              textAlign: "center",
              color: MUTED,
              fontSize: 13,
            }}
          >
            Sales hasn&apos;t filled this demo&apos;s feedback yet.
          </div>
        ) : (
          <>
            {demo.feedbackRating > 0 && (
              <QCard label="Overall session rating (1-10)">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 32,
                      fontWeight: 600,
                      color: NEAR_BLACK,
                      lineHeight: 1,
                    }}
                  >
                    {demo.feedbackRating}
                  </span>
                  <span style={{ fontSize: 14, color: MUTED }}>/ 10</span>
                </div>
              </QCard>
            )}

            <QCard label="Did the tutor effectively explain the topic or concept during the session?">
              <YesNoDisplay value={demo.feedbackExplanation} />
              <CommentBlock text={demo.feedbackExplanationComment} />
            </QCard>

            <QCard label="Were you able to actively participate and ask questions during the session?">
              <YesNoDisplay value={demo.feedbackParticipation} />
              <CommentBlock text={demo.feedbackParticipationComment} />
            </QCard>

            <QCard label="Were there any moments during the session when you felt confused or lost?">
              <YesNoDisplay value={demo.feedbackConfused} />
              <CommentBlock text={demo.feedbackConfusedDetail} />
            </QCard>

            <QCard label="Any moments where you felt uncomfortable during the session?">
              <YesNoDisplay value={demo.feedbackUncomfortable} />
              <CommentBlock text={demo.feedbackUncomfortableDetail} />
            </QCard>

            <QCard label="Did the tutor create a positive learning environment?">
              <YesNoDisplay value={demo.feedbackPositiveEnv} />
              <CommentBlock text={demo.feedbackPositiveEnvComment} />
            </QCard>

            {demo.feedbackSuggestions.trim() && (
              <QCard label="Suggestions for improvement">
                <CommentBlock text={demo.feedbackSuggestions} />
              </QCard>
            )}

            {demo.feedbackComments.trim() && (
              <QCard label="Other comments">
                <CommentBlock text={demo.feedbackComments} />
              </QCard>
            )}

            {/* Footer meta */}
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 12,
                color: MUTED,
                marginTop: 6,
              }}
            >
              {demo.agent && (
                <span>
                  Agent: <strong style={{ color: NEAR_BLACK }}>{demo.agent}</strong>
                </span>
              )}
              {demo.acctType && (
                <span>
                  Accountability: <strong style={{ color: NEAR_BLACK }}>{demo.acctType}</strong>
                </span>
              )}
              {demo.marketing && (
                <span style={{ color: BLUE, fontWeight: 600 }}>Marketing lead</span>
              )}
              {demo.link && (
                <a
                  href={demo.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: BLUE, textDecoration: "none" }}
                >
                  Reference link ↗
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
