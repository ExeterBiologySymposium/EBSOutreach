import { dashboardCounts, failedJobs, listOrgs } from "@/lib/db";

export const dynamic = "force-dynamic";

const FUNNEL_ORDER = [
  "discovered",
  "email_found",
  "researched",
  "drafted",
  "draft_in_gmail",
  "sent",
  "replied",
  "needs_manual",
  "suppressed",
];

export default async function DashboardPage() {
  const [counts, failed, needsManual] = await Promise.all([
    dashboardCounts(),
    failedJobs(),
    listOrgs({ status: "needs_manual", limit: 200 }),
  ]);

  return (
    <main style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      <h1>EBS Outreach — Dashboard</h1>

      <section className="funnel">
        {FUNNEL_ORDER.map((status) => (
          <div className="funnel-stat" key={status}>
            <div className="count">{counts[status] ?? 0}</div>
            <div className="label">{status.replace(/_/g, " ")}</div>
          </div>
        ))}
      </section>

      <h2>Failed jobs ({failed.length})</h2>
      {failed.length === 0 ? (
        <p style={{ color: "var(--col-text-muted)" }}>None.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Org</th>
              <th>Stage</th>
              <th>Attempts</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {failed.map((j: any) => (
              <tr key={j.id}>
                <td><a href={`/?org=${j.org_id}`}>{j.org_id}</a></td>
                <td>{j.stage}</td>
                <td>{j.attempts}</td>
                <td className="error-text">{j.last_error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Needs manual review ({needsManual.length})</h2>
      {needsManual.length === 0 ? (
        <p style={{ color: "var(--col-text-muted)" }}>None.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>School</th>
              <th>State</th>
              <th>Website</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {needsManual.map((o) => (
              <tr key={o.id}>
                <td><a href={`/?org=${o.id}`}>{o.name}</a></td>
                <td>{o.state}</td>
                <td>{o.website ? <a href={o.website} target="_blank" rel="noreferrer">{o.website}</a> : "—"}</td>
                <td>{o.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
