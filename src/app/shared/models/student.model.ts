export interface Student {
  id: string;
  name: string;
  email: string;
  phone?: string;
  level?: string;
  enrolledAt?: any; // Date | Timestamp
  [key: string]: any;
}