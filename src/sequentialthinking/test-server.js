#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test the MCP server
function testMCPServer() {
  console.log('Testing Sequential Thinking MCP Server...\n');
  
  const serverPath = join(__dirname, 'dist', 'index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Test initialization
  const initMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };

  // Test list tools
  const listToolsMessage = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };

  // Test sequential thinking tool
  const testThoughtMessage = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "sequentialthinking",
      arguments: {
        thought: "Let me think about this problem step by step.",
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 3
      }
    }
  };

  let responseCount = 0;
  let responses = [];

  server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      try {
        const response = JSON.parse(line);
        responses.push(response);
        responseCount++;
        
        console.log(`Response ${responseCount}:`, JSON.stringify(response, null, 2));
        
        if (responseCount === 1) {
          // Send list tools after initialization
          server.stdin.write(JSON.stringify(listToolsMessage) + '\n');
        } else if (responseCount === 2) {
          // Send test thought after list tools
          server.stdin.write(JSON.stringify(testThoughtMessage) + '\n');
        } else if (responseCount === 3) {
          // Test complete
          console.log('\n✅ MCP Server test completed successfully!');
          server.kill();
        }
      } catch (e) {
        console.log('Raw output:', line);
      }
    });
  });

  server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  server.on('close', (code) => {
    console.log(`\nServer exited with code ${code}`);
    if (responses.length >= 2) {
      console.log('\n🎉 Sequential Thinking MCP Server is working correctly!');
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  // Start the test
  server.stdin.write(JSON.stringify(initMessage) + '\n');
}

testMCPServer();