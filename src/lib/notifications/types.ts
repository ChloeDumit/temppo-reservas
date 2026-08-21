export type NotificationPayload = {
  studioId: string;
  /** Null when the person has no address on this channel — the send is skipped. */
  to: string | null;
  subject?: string;
  body: string;
  template: string;
  relatedType?: string;
  relatedId?: string;
};

export interface NotificationTransport {
  readonly channel: "EMAIL";
  send(payload: NotificationPayload): Promise<{ ok: boolean; error?: string }>;
}
