export type UserRole = 'student' | 'teacher' | 'parent';

export interface AppUser {
  uid: string;
  email?: string;
  displayName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  timezone?: string;
  isStudent?: boolean;

  // Profile fields used in auth.service mapping
  gender?: string;
  age?: number;
  phone?: string;
  emailVerified?: boolean;

  // Optional but commonly present
  photoURL?: string;
}