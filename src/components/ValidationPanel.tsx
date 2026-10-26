import { isApprovable, validateProject, type ValidationIssue } from "../utils/validation";
import type { ProjectFile } from "../types/project";

function groupLabel(issue: ValidationIssue): string {
  return issue.severity === "blocking" ? "ปัญหาที่ต้องแก้ไขก่อนอนุมัติ" : "คำเตือน";
}

export function ValidationPanel({ project }: { project: ProjectFile }) {
  const issues = validateProject(project);
  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const approvable = isApprovable(project);

  return (
    <div className="panel">
      <h2>Validation</h2>
      {approvable ? (
        <p className="panel__success">
          ผ่านการตรวจสอบที่จำเป็นทั้งหมด — พร้อมส่งออก Approved Furniture Spec
        </p>
      ) : (
        <p className="panel__warning">
          พบปัญหาที่ต้องแก้ไข {blocking.length} รายการ ก่อนจะสามารถอนุมัติโปรเจกต์นี้ได้
        </p>
      )}

      {blocking.length > 0 && (
        <section>
          <h3>{groupLabel(blocking[0])} ({blocking.length})</h3>
          <ul className="issue-list">
            {blocking.map((issue, idx) => (
              <li key={idx} className="issue-list__item issue-list__item--blocking">
                <code>{issue.code}</code> [{issue.entityType}:{issue.entityId}] {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section>
          <h3>{groupLabel(warnings[0])} ({warnings.length})</h3>
          <ul className="issue-list">
            {warnings.map((issue, idx) => (
              <li key={idx} className="issue-list__item issue-list__item--warning">
                <code>{issue.code}</code> [{issue.entityType}:{issue.entityId}] {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {issues.length === 0 && <p>ไม่พบปัญหา</p>}
    </div>
  );
}
