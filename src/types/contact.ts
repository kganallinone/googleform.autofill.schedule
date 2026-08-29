export type ContactInquiryInput = {
  companyName: string;
  email: string;
  message: string;
};

export type ContactInquiryResult = {
  id: string;
  receivedAt: string;
};
