// Contact and message related types

export interface User {
  id: string;
  email: string;
  username: string;
  title?: string;
  bio?: string;
  website?: string;
  contact?: string;
  avatar?: string;
  createdAt: string;
}

export interface ContactMessage {
  id: string;
  author_name: string;
  author_email?: string;
  author_avatar?: string;

  // Message type
  type: 'general' | 'job';

  // Basic info
  subject?: string;
  message: string;

  // Job-specific fields
  company?: string;
  company_email?: string;
  position?: string;
  recruiter_name?: string;              // 招聘者姓名
  recruiter_title?: string;             // 招聘者职位
  send_resume?: boolean;

  // Privacy settings
  isPublic: boolean;                    // 是否公开展示
  consentCompanyLogo: boolean;          // 是否同意展示公司 Logo/名称

  // Status
  status: 'pending' | 'read' | 'replied';

  // Metadata
  createdAt: string;
  updatedAt: string;
  userId?: string;

  // Replies
  replies?: MessageReply[];
}

export interface MessageReply {
  id: string;
  messageId: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  isFromOwner: boolean;
  createdAt: string;
}

export interface MeetingRequest {
  id: string;
  name: string;
  email: string;
  slots: string[];  // 用户提供的可用时间段
  note?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface UserProfile {
  user: User;
  stats: {
    messagesSent: number;
    repliesReceived: number;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}
