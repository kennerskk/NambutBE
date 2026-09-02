const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const { portfolios, saveData, io, server } = require("./server");

// Create MCP Server
const mcpServer = new Server(
  {
    name: "profoliot-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_element",
        description: "Add a new component to the portfolio canvas",
        inputSchema: {
          type: "object",
          properties: {
            portfolio_id: { type: "string", description: "ID of the portfolio (usually 'default')" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"], description: "Which device layout to modify (default: desktop)" },
            type: { type: "string", enum: ["text", "button", "image", "card"] },
            content: { type: "string", description: "Text content or image URL" },
            position: { 
              type: "object", 
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                w: { type: "number", description: "Width" },
                h: { type: "number", description: "Height" }
              }
            },
            style: { type: "object", description: "CSS styles in camelCase, e.g. { backgroundColor: '#f00' }" }
          },
          required: ["portfolio_id", "type", "content", "position"]
        }
      },
      {
        name: "update_element_style",
        description: "Update the CSS style of an existing element",
        inputSchema: {
          type: "object",
          properties: {
            portfolio_id: { type: "string" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"] },
            element_id: { type: "string" },
            new_styles: { type: "object", description: "CSS styles to merge with existing styles" }
          },
          required: ["portfolio_id", "element_id", "new_styles"]
        }
      },
      {
        name: "move_element",
        description: "Move an element to a new position",
        inputSchema: {
          type: "object",
          properties: {
            portfolio_id: { type: "string" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"] },
            element_id: { type: "string" },
            x: { type: "number" },
            y: { type: "number" }
          },
          required: ["portfolio_id", "element_id", "x", "y"]
        }
      },
      {
        name: "delete_element",
        description: "Delete an element from the canvas",
        inputSchema: {
          type: "object",
          properties: {
            portfolio_id: { type: "string" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"] },
            element_id: { type: "string" }
          },
          required: ["portfolio_id", "element_id"]
        }
      },
      {
        name: "update_background",
        description: "Update the canvas background settings",
        inputSchema: {
          type: "object",
          properties: {
            portfolio_id: { type: "string" },
            background: { 
              type: "object", 
              properties: {
                backgroundColor: { type: "string" },
                backgroundImage: { type: "string" },
                backgroundSize: { type: "string" },
                backgroundRepeat: { type: "string" },
                backgroundAttachment: { type: "string" },
                backgroundPosition: { type: "string" }
              }
            }
          },
          required: ["portfolio_id", "background"]
        }
      }
    ]
  };
});

const generateId = () => Math.random().toString(36).substr(2, 9);

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!args.portfolio_id) args.portfolio_id = "default";
  
  if (!portfolios[args.portfolio_id]) {
    throw new Error(`Portfolio ${args.portfolio_id} not found`);
  }
  
  const portfolio = portfolios[args.portfolio_id];
  const device = args.device || "desktop";
  const arrName = `${device}Elements`;

  if (name === "add_element") {
    if (!portfolio[arrName]) portfolio[arrName] = [];
    const newElement = {
      id: generateId(),
      type: args.type,
      content: args.content,
      x: args.position.x || 0,
      y: args.position.y || 0,
      w: args.position.w || 200,
      h: args.position.h || 50,
      style: args.style || {}
    };
    portfolio[arrName].push(newElement);
    saveData();
    io.to(args.portfolio_id).emit('state_update', portfolio);
    
    return {
      content: [{ type: "text", text: `Element added with ID: ${newElement.id} on ${device}` }]
    };
  }
  
  if (name === "update_element_style") {
    if (!portfolio[arrName]) throw new Error("Element not found");
    const el = portfolio[arrName].find(e => e.id === args.element_id);
    if (!el) throw new Error("Element not found");
    
    el.style = { ...el.style, ...args.new_styles };
    saveData();
    io.to(args.portfolio_id).emit('state_update', portfolio);
    
    return {
      content: [{ type: "text", text: `Element ${args.element_id} style updated on ${device}` }]
    };
  }
  
  if (name === "move_element") {
    if (!portfolio[arrName]) throw new Error("Element not found");
    const el = portfolio[arrName].find(e => e.id === args.element_id);
    if (!el) throw new Error("Element not found");
    
    el.x = args.x;
    el.y = args.y;
    saveData();
    io.to(args.portfolio_id).emit('state_update', portfolio);
    
    return {
      content: [{ type: "text", text: `Element ${args.element_id} moved to (${args.x}, ${args.y}) on ${device}` }]
    };
  }

  if (name === "delete_element") {
    if (!portfolio[arrName]) throw new Error("Element not found");
    const initialLength = portfolio[arrName].length;
    portfolio[arrName] = portfolio[arrName].filter(e => e.id !== args.element_id);
    
    if (portfolio[arrName].length === initialLength) {
      throw new Error("Element not found");
    }
    
    saveData();
    io.to(args.portfolio_id).emit('state_update', portfolio);
    
    return {
      content: [{ type: "text", text: `Element ${args.element_id} deleted on ${device}` }]
    };
  }
  
  if (name === "update_background") {
    if (!portfolio.settings) {
      portfolio.settings = {};
    }
    portfolio.settings = { ...portfolio.settings, ...args.background };
    saveData();
    io.to(args.portfolio_id).emit('state_update', portfolio);
    
    return {
      content: [{ type: "text", text: `Background updated successfully` }]
    };
  }
  
  throw new Error(`Tool ${name} not found`);
});

// Run MCP Server using standard I/O (this means it must be run as a standalone process or via MCP client)
async function runMcpServer() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("Profoliot MCP server running on stdio");
}

// Start HTTP server (Express+WebSockets) in the background so it can receive connections
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.error(`HTTP & WS Server running on port ${PORT}`);
  runMcpServer().catch(console.error);
});
