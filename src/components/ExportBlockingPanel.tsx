import type { ValidationIssue } from "../utils/validation";

interface ExportBlockingPanelProps {
  issues: ValidationIssue[];
  onClose: () => void;
  onJumpToIssue: (issue: ValidationIssue) => void;
}

function isNavigable(issue: ValidationIssue): boolean {
  return issue.entityType === "dimension" || issue.entityType === "component";
}

export function ExportBlockingPanel({ issues, onClose, onJumpToIssue }: ExportBlockingPanelProps) {
  return (
    <div className="export-blocking-overlay" role="dialog" aria-modal="true">
      <div className="export-blocking-panel">
        <button type="button" className="export-blocking-panel__close" onClick={onClose}>
          ปิด
        </button>
        <h2>ยังไม่สามารถอนุมัติได้ ({issues.length} รายการ)</h2>
        <p className="export-blocking-panel__hint">
          ต้องแก้ไขปัญหาทั้งหมดด้านล่างก่อนจึงจะส่งออก Approved Furniture Spec ได้
        </p>
        <ul className="export-blocking-panel__list">
          {issues.map((issue, idx) => {
            const navigable = isNavigable(issue);
            return (
              <li
                key={`${issue.code}-${issue.entityId}-${idx}`}
                className={
                  navigable
                    ? "export-blocking-panel__item export-blocking-panel__item--navigable"
                    : "export-blocking-panel__item"
                }
              >
                {navigable ? (
                  <button type="button" onClick={() => onJumpToIssue(issue)}>
                    [{issue.entityType}] {issue.message}
                  </button>
                ) : (
                  <span>
                    [{issue.entityType}] {issue.message}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
