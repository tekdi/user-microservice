/**
 * Interface for GroupMember entity
 * This should match your existing GroupMember entity structure
 * Adjust field names/types as needed to match your actual implementation
 */
export interface IGroupMember {
  id: string;
  groupId: string;
  userId: string;
  lastReadMessageId?: string | null;
  lastReadAt?: Date | null;
  // Add other fields as per your existing GroupMember entity
}

/**
 * Repository interface for GroupMember operations
 * Implement this interface in your application to provide GroupMember access
 */
export interface IGroupMemberRepository {
  findOneByGroupAndUser(
    groupId: string,
    userId: string,
  ): Promise<IGroupMember | null>;
  updateLastRead(
    groupId: string,
    userId: string,
    lastReadMessageId?: string,
    lastReadAt?: Date,
  ): Promise<void>;
}

