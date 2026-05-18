declare module "openclaw/plugin-sdk/channel-entry-contract" {
  export function defineBundledChannelEntry(entry: any): any;
}

declare module "openclaw/plugin-sdk/channel-core" {
  export type ChannelPlugin<T = any> = any;
  export function defineSetupPluginEntry(plugin: any): any;
  export function buildChannelConfigSchema(schema: any): any;
  export function buildChannelOutboundSessionRoute(input: any): any;
  export function createChatChannelPlugin(input: any): any;
  export function defineChannelPluginEntry(input: any): any;
}

declare module "openclaw/plugin-sdk/channel-plugin-common" {
  export function getChatChannelMeta(channelId: string): any;
}

declare module "openclaw/plugin-sdk/channel-contract" {
  export type ChannelGatewayContext<T = any> = any;
  export type ChannelMessageActionAdapter = any;
  export type ChannelMessageActionName = any;
}

declare module "openclaw/plugin-sdk/config-runtime" {
  export type OpenClawConfig = any;
}

declare module "openclaw/plugin-sdk/runtime-store" {
  export type PluginRuntime = any;
  export function createPluginRuntimeStore<T = any>(...args: any[]): any;
}

declare module "openclaw/plugin-sdk/runtime" {
  export type RuntimeEnv = any;
}

declare module "openclaw/plugin-sdk/status-helpers" {
  export function createComputedAccountStatusAdapter<T = any>(...args: any[]): any;
  export function createDefaultChannelRuntimeState(...args: any[]): any;
}

declare module "openclaw/plugin-sdk/inbound-reply-dispatch" {
  export function dispatchInboundReplyWithBase(...args: any[]): any;
}

declare module "openclaw/plugin-sdk/channel-reply-pipeline" {
  export function createChannelReplyPipeline(...args: any[]): any;
}

declare module "openclaw/plugin-sdk/channel-config-schema" {
  export function buildChannelConfigSchema(schema: any): any;
}

declare module "openclaw/plugin-sdk/zod" {
  export const z: any;
}

declare module "openclaw/plugin-sdk/account-helpers" {
  export function createAccountListHelpers(...args: any[]): any;
}

declare module "openclaw/plugin-sdk/account-id" {
  export const DEFAULT_ACCOUNT_ID: string;
  export function normalizeAccountId(input: unknown): string;
}

declare module "openclaw/plugin-sdk/account-resolution" {
  export function resolveMergedAccountConfig<T = any>(...args: any[]): T;
}

declare module "openclaw/plugin-sdk/text-runtime" {
  export function normalizeOptionalString(input: unknown): string | undefined;
}

