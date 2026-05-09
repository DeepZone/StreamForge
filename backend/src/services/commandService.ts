import { Command } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { BotMessage } from '../core/types.js';
import { detectFaq, resolveRange } from './analyticsService.js';
import { audit } from './auditService.js';

const cooldownMemory = new Map<string, number>();

export const parseCommand = (content: string, prefix: string) => {
  if (!content.startsWith(prefix)) return null;
  const body = content.slice(prefix.length).trim();
  if (!body) return null;
  const [name, ...args] = body.split(/\s+/u);
  return { name: name.toLowerCase(), args };
};

export const findCommand = async (channelId: string, commandName: string): Promise<Command | null> => {
  const commands = await prisma.command.findMany({ where: { channelId, enabled: true } });
  return commands.find((c) => c.name === commandName || JSON.parse(c.aliasesJson || '[]').includes(commandName)) ?? null;
};
export const executeCustomCommand = async (_channelId: string, command: Command, _message: BotMessage) => command.response;
export const incrementUsage = async (commandId: string) => { await prisma.command.update({ where: { id: commandId }, data: { usageCount: { increment: 1 } } }); };
export const checkCooldown = (channelId: string, commandId: string, userId: string, cooldownSeconds: number) => {
  if (!cooldownSeconds) return true;
  const key = `${channelId}:${commandId}:${userId}`;
  const now = Date.now();
  const last = cooldownMemory.get(key) ?? 0;
  if (now - last < cooldownSeconds * 1000) return false;
  cooldownMemory.set(key, now);
  return true;
};

export const getCommandSuggestions = async (channelId: string, query: { from?: string; to?: string; limit?: string }) => {
  const range = resolveRange(query);
  const faq = await detectFaq(channelId, range);
  const commands = await prisma.command.findMany({ where: { channelId } });
  const names = new Set(commands.map((c) => c.name));
  const aliases = new Set(commands.flatMap((c) => JSON.parse(c.aliasesJson || '[]')));
  return faq.map((f) => ({ sourceQuestion: f.question, count: f.count, suggestedName: f.suggestedCommandName, suggestedResponse: f.suggestedResponseDraft, alreadyExists: names.has(f.suggestedCommandName) || aliases.has(f.suggestedCommandName) }));
};


export const createCommandFromSuggestion = async (channelId: string, userId: string | undefined, body: { name: string; response: string; aliases?: string[]; sourceQuestion?: string }) => {
  const aliases = Array.from(new Set((body.aliases || []).map((a) => a.trim().toLowerCase()).filter(Boolean)));
  const existing = await prisma.command.findMany({ where: { channelId } });
  const aliasSet = new Set(existing.flatMap((c) => JSON.parse(c.aliasesJson || '[]')));
  if (existing.some((c) => c.name === body.name) || aliasSet.has(body.name)) throw new Error('conflict');
  const created = await prisma.command.create({ data: { channelId, name: body.name, response: body.response, aliasesJson: JSON.stringify(aliases), enabled: true, cooldownSeconds: 0, requiredRole: 'viewer', conditionsJson: '{}' } });
  await audit('command.create_from_suggestion', userId, channelId, { commandId: created.id, name: body.name, sourceQuestion: body.sourceQuestion || null });
  return created;
};
