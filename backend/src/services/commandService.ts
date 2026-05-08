import { Command } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { BotMessage } from '../core/types.js';

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

export const executeCustomCommand = async (_channelId: string, command: Command, _message: BotMessage) => {
  return command.response;
};

export const incrementUsage = async (commandId: string) => {
  await prisma.command.update({ where: { id: commandId }, data: { usageCount: { increment: 1 } } });
};

export const checkCooldown = (channelId: string, commandId: string, userId: string, cooldownSeconds: number) => {
  if (!cooldownSeconds) return true;
  const key = `${channelId}:${commandId}:${userId}`;
  const now = Date.now();
  const last = cooldownMemory.get(key) ?? 0;
  if (now - last < cooldownSeconds * 1000) return false;
  cooldownMemory.set(key, now);
  return true;
};
