import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { WEBHOOK_EVENTS } from '../webhook-dispatcher.service';

/**
 * Payload for registering an outbound webhook.
 *
 * `organizationId` is set by the server (never accepted from the client) and the
 * signing `secret` is generated server-side — it is never accepted here, and is
 * returned to the client only once, in the create response.
 */
export class CreateWebhookDto {
  /**
   * Destination URL the signed payload is POSTed to. Only http(s) URLs are
   * accepted; `require_tld: false` allows localhost and other dev hosts.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  url!: string;

  /** Event names this endpoint subscribes to; each must be a known event. */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events!: string[];

  /** Whether the webhook is active. Defaults to true in the service. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
