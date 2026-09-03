const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} = require("@modelcontextprotocol/sdk/types.js");

const db = require("./src/config/db");

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
        description: "Add a new component to the introduction card canvas",
        inputSchema: {
          type: "object",
          properties: {
            card_id: { type: "string", description: "ID of the introduction card" },
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
          required: ["card_id", "type", "content", "position"]
        }
      },
      {
        name: "update_element_style",
        description: "Update the CSS style of an existing element",
        inputSchema: {
          type: "object",
          properties: {
            card_id: { type: "string" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"] },
            element_id: { type: "string" },
            new_styles: { type: "object", description: "CSS styles to merge with existing styles" }
          },
          required: ["card_id", "element_id", "new_styles"]
        }
      },
      {
        name: "move_element",
        description: "Move an element to a new position",
        inputSchema: {
          type: "object",
          properties: {
            card_id: { type: "string" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"] },
            element_id: { type: "string" },
            x: { type: "number" },
            y: { type: "number" }
          },
          required: ["card_id", "element_id", "x", "y"]
        }
      },
      {
        name: "delete_element",
        description: "Delete an element from the canvas",
        inputSchema: {
          type: "object",
          properties: {
            card_id: { type: "string" },
            device: { type: "string", enum: ["desktop", "tablet", "mobile"] },
            element_id: { type: "string" }
          },
          required: ["card_id", "element_id"]
        }
      },
      {
        name: "update_background",
        description: "Update the canvas background settings",
        inputSchema: {
          type: "object",
          properties: {
            card_id: { type: "string" },
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
          required: ["card_id", "background"]
        }
      }
    ]
  };
});

const generateId = () => Math.random().toString(36).substr(2, 9);

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!args.card_id) throw new Error("card_id is required");
  
  const result = await db.query('SELECT * FROM cards WHERE id = $1', [args.card_id]);
  if (result.rows.length === 0) {
    throw new Error(`introduction card ${args.card_id} not found in database`);
  }
  
  const card = result.rows[0];
  const device = args.device || "desktop";
  const arrName = `${device}_elements`;
  let elements = card[arrName] || [];

  if (name === "add_element") {
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
    elements.push(newElement);
    await db.query(`UPDATE cards SET ${arrName} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [JSON.stringify(elements), args.card_id]);
    
    return {
      content: [{ type: "text", text: `Element added with ID: ${newElement.id} on ${device}` }]
    };
  }
  
  if (name === "update_element_style") {
    const elIndex = elements.findIndex(e => e.id === args.element_id);
    if (elIndex === -1) throw new Error("Element not found");
    
    elements[elIndex].style = { ...elements[elIndex].style, ...args.new_styles };
    await db.query(`UPDATE cards SET ${arrName} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [JSON.stringify(elements), args.card_id]);
    
    return {
      content: [{ type: "text", text: `Element ${args.element_id} style updated on ${device}` }]
    };
  }
  
  if (name === "move_element") {
    const elIndex = elements.findIndex(e => e.id === args.element_id);
    if (elIndex === -1) throw new Error("Element not found");
    
    elements[elIndex].x = args.x;
    elements[elIndex].y = args.y;
    await db.query(`UPDATE cards SET ${arrName} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [JSON.stringify(elements), args.card_id]);
    
    return {
      content: [{ type: "text", text: `Element ${args.element_id} moved to (${args.x}, ${args.y}) on ${device}` }]
    };
  }

  if (name === "delete_element") {
    const initialLength = elements.length;
    elements = elements.filter(e => e.id !== args.element_id);
    
    if (elements.length === initialLength) {
      throw new Error("Element not found");
    }
    
    await db.query(`UPDATE cards SET ${arrName} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [JSON.stringify(elements), args.card_id]);
    
    return {
      content: [{ type: "text", text: `Element ${args.element_id} deleted on ${device}` }]
    };
  }
  
  if (name === "update_background") {
    let settings = card.settings || {};
    settings = { ...settings, ...args.background };
    await db.query(`UPDATE cards SET settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [settings, args.card_id]);
    
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
  console.error("Nambut MCP server running on stdio");
}

runMcpServer().catch(console.error);
