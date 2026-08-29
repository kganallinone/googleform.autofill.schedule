import type {
  ContactInquiryInput,
  ContactInquiryResult,
} from "@/types/contact";

export async function submitContactInquiry(
  input: ContactInquiryInput,
): Promise<ContactInquiryResult> {
  await Promise.resolve();

  return {
    id: `${input.companyName.toLowerCase().replace(/\s+/g, "-")}-${crypto.randomUUID()}`,
    receivedAt: new Date().toISOString(),
  };
}
