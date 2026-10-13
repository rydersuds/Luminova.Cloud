import type { Request } from "express";
import { workspaceChatUsers } from "../routes/users";
import { logger } from "./logger";

export type ApprovalEmailFacts = {
  id: string;
  projectName: string;
  tradeLabel: string;
  vendor: string | null;
  description: string;
  amount: number;
  overage: number;
  remainingBefore: number | null;
  requestedById: string;
  requestedByName: string;
  status: string;
  decidedByName?: string | null;
  decisionNote?: string | null;
  budgetIncrease?: number | null;
};

export type ApprovalEvent =
  | { type: "requested"; approval: ApprovalEmailFacts }
  | { type: "decided"; approval: ApprovalEmailFacts };

export type ApprovalNotifier = (req: Request, event: ApprovalEvent) => Promise<void>;

type Email = { to: string[]; subject: string; text: string; html: string };

const money = (value: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function approvalsLink() {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  return base ? `${base}/approvals` : null;
}

/** Sends one email through Resend's HTTP API. Mail failures are logged and never affect approval decisions. */
export async function sendEmail(email: Email): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.APPROVAL_EMAIL_FROM;
  if (!apiKey || !from) {
    logger.info({ subject: email.subject, recipients: email.to.length }, "Approval email skipped: RESEND_API_KEY or APPROVAL_EMAIL_FROM not set");
    return false;
  }
  if (!email.to.length) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text, html: email.html }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, subject: email.subject }, "Approval email was not accepted by the email service");
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ err: error, subject: email.subject }, "Approval email delivery failed");
    return false;
  }
}

export function requestEmail(approval: ApprovalEmailFacts, to: string[]): Email {
  const link = approvalsLink();
  const lines = [
    `${approval.requestedByName} needs approval to spend ${money(approval.amount)} on ${approval.tradeLabel} for ${approval.projectName}.`,
    approval.remainingBefore === null
      ? "This trade has no reliable budget, so every purchase needs approval."
      : `The trade had ${money(approval.remainingBefore)} left, so this is ${money(approval.overage)} over budget.`,
    approval.vendor ? `Vendor: ${approval.vendor}` : null,
    `Reason: ${approval.description}`,
    link ? `Approve or decline: ${link}` : "Open Approvals in Luminova to approve or decline.",
  ].filter((line): line is string => Boolean(line));
  return {
    to,
    subject: `Approval needed: ${money(approval.amount)} ${approval.tradeLabel} · ${approval.projectName}`,
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join(""),
  };
}

export function decisionEmail(approval: ApprovalEmailFacts, to: string[]): Email {
  const approved = approval.status === "Approved";
  const lines = [
    `${approval.decidedByName ?? "An administrator"} ${approved ? "approved" : "declined"} your request to spend ${money(approval.amount)} on ${approval.tradeLabel} for ${approval.projectName}.`,
    approved && approval.budgetIncrease ? `The ${approval.tradeLabel} budget was raised by ${money(approval.budgetIncrease)}.` : null,
    approval.decisionNote ? `Note: ${approval.decisionNote}` : null,
    approved ? "You can go ahead with the purchase." : "Don't make this purchase. Reply to the approver if you need to discuss it.",
  ].filter((line): line is string => Boolean(line));
  return {
    to,
    subject: `${approved ? "Approved" : "Declined"}: ${money(approval.amount)} ${approval.tradeLabel} · ${approval.projectName}`,
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
  };
}

type ApprovalRecipient = { id: string; email: string; role: string };
type EmailApprovalNotifierDependencies = {
  usersForRequest: (req: Request) => Promise<ApprovalRecipient[]>;
  deliver: (email: Email) => Promise<boolean>;
};

/** Emails workspace Admins about new requests and only the requester about a decision. */
export function createEmailApprovalNotifier(
  dependencies: EmailApprovalNotifierDependencies = {
    usersForRequest: workspaceChatUsers,
    deliver: sendEmail,
  },
): ApprovalNotifier {
  return async (req, event) => {
    let users: ApprovalRecipient[];
    try {
      users = await dependencies.usersForRequest(req);
    } catch (error) {
      logger.warn({ err: error, approvalId: event.approval.id }, "Approval notification recipients could not be loaded");
      return;
    }
    if (event.type === "requested") {
      const admins = users.filter((user) => user.role === "Admin" && user.email).map((user) => user.email);
      if (!admins.length) {
        logger.info({ approvalId: event.approval.id }, "Approval request email skipped: no Admin email addresses are available");
        return;
      }
      await dependencies.deliver(requestEmail(event.approval, admins));
      return;
    }
    const requester = users.find((user) => user.id === event.approval.requestedById && user.email);
    if (!requester) {
      logger.warn({ approvalId: event.approval.id }, "Approval decision email skipped: requester email is unavailable");
      return;
    }
    await dependencies.deliver(decisionEmail(event.approval, [requester.email]));
  };
}

export const emailApprovalNotifier = createEmailApprovalNotifier();
