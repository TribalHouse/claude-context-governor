#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'fake-stdio-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo',
      description: 'Echo text back to the caller',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
      },
    },
    {
      name: 'slow',
      description: 'Wait before returning',
      inputSchema: {
        type: 'object',
        properties: { ms: { type: 'number' } },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args = {} } = request.params;
  if (name === 'echo') {
    return { content: [{ type: 'text', text: args.text || '' }] };
  }
  if (name === 'slow') {
    await new Promise(resolve => setTimeout(resolve, args.ms || 250));
    return { content: [{ type: 'text', text: 'slow done' }] };
  }
  return { isError: true, content: [{ type: 'text', text: `unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
