import type { ContactMessage } from '../../types/contact';
import { get, post } from '../utils';

export interface CreateContactMessagePayload {
  type: 'general' | 'job';
  author_name?: string;
  author_email?: string;
  subject?: string;
  message: string;
  company?: string;
  company_email?: string;
  position?: string;
  recruiter_name?: string;
  recruiter_title?: string;
  send_resume?: boolean;
  is_public: boolean;
  consent_company_logo?: boolean;
  fingerprint: string;
}

interface ContactMessageListResponse {
  items: ContactMessage[];
}

export const createContactMessage = (
  payload: CreateContactMessagePayload,
): Promise<ContactMessage> =>
  post<ContactMessage>('/api/v1/contact/messages', payload);

export const listPublicContactMessages = async (): Promise<ContactMessage[]> => {
  const response = await get<ContactMessageListResponse>('/api/v1/contact/messages/public');
  return response.items ?? [];
};
