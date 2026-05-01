export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ol"; items: string[] }
  | { type: "ul"; items: string[] }
  | {
      type: "callout";
      tone?: "info" | "warning" | "tip" | "success";
      title?: string;
      text: string;
    }
  | { type: "kv"; rows: { k: string; v: string }[] }
  | { type: "diagram"; nodes: string[]; edges: { from: string; to: string; label?: string }[] };

export type HelpRole =
  | "Employee"
  | "Manager Approver"
  | "Finance Approver"
  | "Accounting Admin"
  | "System Admin";

export type HelpTopic = {
  id: string;
  title: string;
  category: string;
  summary: string;
  roles?: HelpRole[];
  whoCanDo?: string;
  related?: string[];
  blocks: HelpBlock[];
  keywords?: string[];
};

export type HelpCategory = {
  id: string;
  title: string;
  description?: string;
  topicIds: string[];
};
