export type NotificationPayload = {
  studioId: string;
  to: string;
  subject?: string;
  body: string;
  template: string;
  relatedType?: string;
  relatedId?: string;
};

export interface NotificationTransport {
  readonly channel: "EMAIL" | "WHATSAPP";
  send(payload: NotificationPayload): Promise<{ ok: boolean; error?: string }>;
}
