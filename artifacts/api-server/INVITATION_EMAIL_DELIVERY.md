# Invitation email delivery checks

Workspace and client invitations are created through Clerk. The API explicitly requests email notification for both instance invitations and organization invitations. A successful API response means Clerk accepted the invitation operation; it does not confirm that the recipient's mail server delivered the message or that it reached the inbox.

When an invitation is missing:

1. Confirm the recipient address shown in **Users & Roles** is correct, then ask the recipient to check spam and organizational quarantine folders.
2. For production instances, check Clerk Dashboard **Email Logs** for the recipient and invitation time. Review the delivery status, any delay or bounce reason, and the receiving mail service's response.
3. Check whether the address is on Clerk's email suppression list. If it is, resolve the underlying issue and remove it before requesting a new invitation; removing an address from suppression does not resend an earlier email.
4. Review Clerk's email deliverability guidance and the instance's sending-domain setup, including sender mailbox and DMARC/DNS configuration. If invitation templates have been customized or Clerk delivery has been disabled for a template, verify those settings as well.
5. Once the address and delivery configuration are confirmed, use **Resend** in the workspace invitation list. Resending creates a replacement invitation; it does not prove delivery.

The API logs the workspace, recipient domain, Clerk status/code when available, and operation. It deliberately does not log the recipient's full email address.

References:

- [Clerk organization invitation API](https://clerk.com/docs/reference/backend/organization/create-organization-invitation)
- [Clerk email logs](https://clerk.com/docs/guides/dashboard/logs/email-logs)
- [Clerk email deliverability](https://clerk.com/docs/guides/development/troubleshooting/email-deliverability)
- [Clerk email suppression lists](https://clerk.com/docs/guides/development/troubleshooting/email-suppression-lists)
