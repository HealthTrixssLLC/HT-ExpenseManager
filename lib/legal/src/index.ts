/**
 * Canonical Healthtrix End User Agreement.
 *
 * Single source of truth for the EULA shown across the web and mobile apps.
 * The text is intentionally a plain, standard SaaS template — Healthtrix can
 * swap the copy in this file without touching either client.
 */

export const EULA_VERSION = "1.0.0";
export const EULA_EFFECTIVE_DATE = "May 1, 2026";
export const EULA_PRODUCT_NAME = "Healthtrix Expense";
export const EULA_COMPANY = "Healthtrix";

export interface EulaSection {
  /** Stable id, suitable for anchors / list keys. */
  id: string;
  heading: string;
  /** One or more paragraphs of plain text. */
  paragraphs: string[];
}

export const EULA_INTRO =
  `This End User Agreement ("Agreement") is a binding contract between you and ` +
  `${EULA_COMPANY} ("we", "us", or "our") that governs your access to and use of ` +
  `${EULA_PRODUCT_NAME} (the "Service"). By signing in to or otherwise using the ` +
  `Service, you acknowledge that you have read, understood, and agree to be bound ` +
  `by this Agreement.`;

export const EULA_SECTIONS: EulaSection[] = [
  {
    id: "license",
    heading: "1. License & Acceptable Use",
    paragraphs: [
      `Subject to your compliance with this Agreement, ${EULA_COMPANY} grants you a ` +
        `limited, non-exclusive, non-transferable, revocable license to access and use ` +
        `the Service for your internal business purposes.`,
      `You agree not to: (a) use the Service for any unlawful, fraudulent, or abusive ` +
        `purpose; (b) interfere with or disrupt the integrity or performance of the ` +
        `Service; (c) attempt to gain unauthorized access to the Service or its related ` +
        `systems; (d) reverse engineer or copy any features or user interface of the ` +
        `Service; or (e) submit expense data that you know to be false, inflated, or ` +
        `otherwise non-compliant with your organization's policies.`,
    ],
  },
  {
    id: "accounts",
    heading: "2. Account Responsibility",
    paragraphs: [
      `You are responsible for safeguarding your sign-in credentials and for all ` +
        `activity that occurs under your account. You agree to notify your ` +
        `organization's administrator promptly of any unauthorized use of your account ` +
        `or any other breach of security.`,
      `You must provide accurate and complete information when creating an account and ` +
        `keep that information current.`,
    ],
  },
  {
    id: "data-privacy",
    heading: "3. Data & Privacy",
    paragraphs: [
      `The Service processes business data, including expense reports, receipts, and ` +
        `related financial information, on behalf of your organization. Your ` +
        `organization controls how that data is collected and retained.`,
      `Where a separate Privacy Policy is published by ${EULA_COMPANY} or your ` +
        `organization, that policy describes how personal information is handled and is ` +
        `incorporated into this Agreement by reference.`,
    ],
  },
  {
    id: "ip",
    heading: "4. Intellectual Property",
    paragraphs: [
      `The Service, including all software, designs, trademarks, and content provided ` +
        `by ${EULA_COMPANY}, is owned by ${EULA_COMPANY} or its licensors and is ` +
        `protected by intellectual property laws. No rights are granted to you other ` +
        `than the limited license expressly described in this Agreement.`,
      `Content you submit to the Service (such as receipts and report data) remains ` +
        `the property of you or your organization. You grant ${EULA_COMPANY} the rights ` +
        `necessary to host, process, and display that content in order to operate the ` +
        `Service.`,
    ],
  },
  {
    id: "disclaimer",
    heading: "5. Disclaimers",
    paragraphs: [
      `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY ` +
        `KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF ` +
        `MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND ` +
        `NON-INFRINGEMENT. ${EULA_COMPANY} DOES NOT WARRANT THAT THE SERVICE WILL BE ` +
        `UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.`,
    ],
  },
  {
    id: "liability",
    heading: "6. Limitation of Liability",
    paragraphs: [
      `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ${EULA_COMPANY.toUpperCase()} ` +
        `WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR ` +
        `PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING ` +
        `OUT OF OR RELATING TO THIS AGREEMENT OR THE SERVICE, WHETHER OR NOT ` +
        `${EULA_COMPANY.toUpperCase()} HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH ` +
        `DAMAGES.`,
    ],
  },
  {
    id: "termination",
    heading: "7. Termination",
    paragraphs: [
      `Your access to the Service may be suspended or terminated at any time by ` +
        `${EULA_COMPANY} or your organization for any reason, including violation of ` +
        `this Agreement. Upon termination, your right to use the Service immediately ` +
        `ends. Sections that by their nature should survive termination will survive.`,
    ],
  },
  {
    id: "changes",
    heading: "8. Changes to this Agreement",
    paragraphs: [
      `${EULA_COMPANY} may update this Agreement from time to time. Material changes ` +
        `will be communicated through the Service. Your continued use of the Service ` +
        `after an updated version takes effect constitutes acceptance of the changes.`,
    ],
  },
  {
    id: "governing-law",
    heading: "9. Governing Law",
    paragraphs: [
      `This Agreement is governed by the laws of the jurisdiction in which ` +
        `${EULA_COMPANY} is established, without regard to its conflict-of-law ` +
        `principles. Specific governing law and venue may be set out in your ` +
        `organization's separate agreement with ${EULA_COMPANY}.`,
    ],
  },
  {
    id: "contact",
    heading: "10. Contact",
    paragraphs: [
      `Questions about this Agreement should be directed to your organization's ` +
        `${EULA_PRODUCT_NAME} administrator, who can escalate to ${EULA_COMPANY} as ` +
        `needed.`,
    ],
  },
];

/** Short single-line label suitable for footers and acknowledgement lines. */
export const EULA_SHORT_LABEL = "End User Agreement";

/** Acknowledgement sentence shown on login screens. */
export const EULA_ACKNOWLEDGEMENT_PREFIX =
  "By signing in you agree to the";
