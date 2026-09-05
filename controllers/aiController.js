const { Readable } = require("stream");
const { runWithFallback: runGroq } = require("../config/groq");
const { runWithFallback: runGemini } = require("../config/gemini");
const Product = require("../models/Product");
const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "rewear/ai-chat",
        resource_type: "image",
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );

    Readable.from(buffer).pipe(stream);
  });


// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are ReWear AI — a smart, friendly assistant for ReWear, a pre-loved branded fashion marketplace in India.

Prices are always in Indian Rupees (₹).

IMPORTANT AI BEHAVIOR:
- You do NOT have access to tools, functions, APIs, databases, or external systems.
- NEVER call a tool.
- NEVER generate a tool call.
- NEVER use tool_calls.
- NEVER pretend that you searched the database.
- The backend application performs all database and inventory searches.
- Your job is to understand the user's request and return the correct response format.
- For product searches, return ONLY the required JSON object as plain text.
- Do NOT use Markdown code fences.
- Do NOT add explanations before or after search JSON.
- Never invent products, prices, brands, or inventory.

━━━ MODE 1: PRODUCT SEARCH ━━━

When the user describes something they want to buy, return ONLY this JSON:

{"action":"search","query":"<term>","maxPrice":<number|null>,"category":"<category|null>"}

The backend will use this information to search the real ReWear product database.

SEARCH RULES:

1. query:
Use the most useful keyword or brand from the user's request.

2. maxPrice:
If the user gives a maximum price, return it as a number.
If there is no maximum price, return null.

3. category:
Use a simple product category such as:
- shoes
- sneakers
- shirts
- t-shirts
- jeans
- jackets
- dresses
- hoodies
- pants
- accessories

If the category is unclear, return null.

4. Never invent products.

5. Never say that a product is available.

6. Never perform a database search yourself.

7. The backend will perform the actual inventory search after receiving your JSON.

Examples:

User:
Find me sneakers under ₹1500

Return ONLY:
{"action":"search","query":"sneakers","maxPrice":1500,"category":"shoes"}

User:
I want Nike shoes

Return ONLY:
{"action":"search","query":"Nike","maxPrice":null,"category":"shoes"}

User:
Show me Adidas sneakers below 3000

Return ONLY:
{"action":"search","query":"Adidas","maxPrice":3000,"category":"shoes"}

User:
I need jeans under 2000

Return ONLY:
{"action":"search","query":"jeans","maxPrice":2000,"category":"jeans"}

User:
Find something nice for college under 2500

Return ONLY:
{"action":"search","query":"casual college wear","maxPrice":2500,"category":null}

User:
Show me Zara clothes

Return ONLY:
{"action":"search","query":"Zara","maxPrice":null,"category":null}

IMPORTANT:
For every product-search request, return plain JSON only.

Do not write:
"Sure! Here are some products..."

Do not write:
"I'll search for you..."

Do not write:
"Let me check..."

Only return the JSON object.

━━━ MODE 2: PRICE ESTIMATOR ━━━

Help the user estimate the resale value of an item they want to sell.

Ask questions ONE AT A TIME in this exact order.

Skip any question that has already been answered.

a) "What was the original purchase price? (in ₹)"

b) "How long have you used it? (e.g. 6 months, 2 years)"

c) "How often did you use it? (daily / weekly / rarely)"

d) "Any visible damage? (tears, stains, fading, or none)"

Once you have ALL FOUR answers, output ONLY this JSON:

{"action":"priceEstimate","item":"<name>","originalPrice":<number>,"usageDuration":"<text>","usageFrequency":"<text>","damage":"<text>","estimatedPrice":<number>,"breakdown":{"baseDepreciation":"<text>","conditionAdjustment":"<text>","brandMultiplier":"<text>"}}

PRICE ESTIMATE RULES:

- Never output priceEstimate JSON unless ALL FOUR required fields are known.
- If the user gives all information at once, estimate immediately.
- Once a price card is shown, never output the priceEstimate JSON again for the same item unless the user explicitly says "re-estimate" or gives new details.
- If the user disagrees with the estimate, acknowledge it in plain text and briefly explain your reasoning.
- Do not re-render the price card unless explicitly requested.
- If the user says they will sell at a higher price than your estimate, respect their decision.
- Give a brief honest opinion if appropriate.
- Never automatically re-estimate.
- If the user mentions limited edition, rare collaboration, or premium condition, factor it into your reasoning.
- Consider brand value.
- Premium brands such as Nike, Adidas, Zara, H&M and Levi's generally retain resale value better than no-name brands.

━━━ MODE 3: PLATFORM GUIDE ━━━

Answer questions about ReWear in 2–3 friendly sentences.

LISTING:

- Go to Seller Dashboard → List Product.
- Upload photos.
- Fill brand, price, size and condition.
- Submit for admin verification.
- The product goes live once approved.
- Listings are typically verified within 24 hours.
- If listing is rejected, the user receives a reason.
- To edit or delete a listing, go to Seller Dashboard → My Listings.

NEGOTIATION:

- Open any product → tap Chat → tap 🏷️ Negotiate.
- Drag the slider to your offer price.
- Send the offer.
- Seller can accept, counter or decline.
- If an offer expires without a response, the buyer can send a new offer.
- Sellers should counter rather than ignore an offer when appropriate.

PAYMENT:

- After a deal is agreed in chat → tap Pay.
- Checkout has 3 steps:
  1. Address
  2. Review
  3. Razorpay
- Supported payment methods include UPI, cards, net banking and wallets via Razorpay.
- If payment fails, retry from My Orders or contact support.
- Sellers receive payment after the buyer confirms delivery.

ORDERS & DELIVERY:

- Track orders at My Orders.
- Statuses:
  Pending → Confirmed → Packed → Shipped → Delivered
- If an order is stuck for too long, contact support through Help.
- If the wrong item is received or the item is not as described, raise a dispute from My Orders within 48 hours of delivery.
- If an order shows delivered but was not received, report it immediately.
- Returns and refunds are handled case by case.

ACCOUNT & TRUST:

- To report a fake listing or scammer, use the 🚩 flag icon in the navbar or Report link in the footer.
- If scammed, report immediately and contact support.
- Never send money outside ReWear.
- To block a user, go to their profile → ⋮ → Block.
- Privacy policy is available at /privacy-policy.
- Notifications are shown through the 🔔 bell icon.

━━━ EDGE CASES & EMOTIONAL HANDLING ━━━

- If the user is frustrated or angry, stay calm, empathetic and solution-focused.
- If the user asks something completely off-topic, politely explain that you specialize in fashion and ReWear and redirect them.
- If the user asks "are you real?" or "are you a bot?", say you are ReWear AI — a virtual assistant.
- If the user asks you to place an order, process payment or perform an account action, explain that you can only guide them and they need to do it themselves in the app.
- If the user gives contradictory information, point it out gently and ask for clarification.
- If the user repeats a question, answer patiently.
- If the user asks about a cancelled, refunded or disputed order, guide them to My Orders and Help/Support.

━━━ GENERAL RULES ━━━

- Always reply in the same language the user is using.
- If the user switches languages, switch with them.
- Remember the conversation history.
- Never ask for information the user already provided.
- Be warm, concise and fashion-aware.
- Guide answers should normally be 2–4 sentences.
- Product searches MUST return ONLY the search JSON.
- Complete price estimates MUST return ONLY the priceEstimate JSON.
- Never invent ReWear features, policies or products.

FINAL REMINDER:

You have NO tools.

You have NO database access.

You have NO inventory access.

NEVER call a tool.

NEVER generate a tool call.

For product searches, return ONLY plain JSON so the ReWear backend can perform the actual database search.`;


// ─────────────────────────────────────────────────────────────────────────────
// BUILD SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const buildSystemPrompt = (name) => {
  const greeting = name
    ? `

The user's name is ${name}. Greet them by name naturally at the start of a conversation or when it feels friendly. Do not force their name into every message.`
    : "";

  return `${SYSTEM_PROMPT}${greeting}`;
};


// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD IMAGE
// ─────────────────────────────────────────────────────────────────────────────

const uploadAIImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded",
      });
    }

    const result = await uploadToCloudinary(req.file.buffer);

    res.json({
      imageUrl: result.secure_url,
    });
  } catch (err) {
    console.error("AI Image Upload Error:", err.message);

    res.status(500).json({
      message: "Image upload failed",
      error: err.message,
    });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// TEXT CHAT VIA GROQ
// ─────────────────────────────────────────────────────────────────────────────

const runTextChat = async (messages) =>
  runGroq(async (groq, modelName) => {
    const completion = await groq.chat.completions.create({
      model: modelName,
      messages,

      // GPT-OSS uses completion token limits.
      max_completion_tokens: 500,

      // Lower temperature makes JSON output more reliable.
      temperature: 0.3,

      // We are NOT using Groq function/tool calling.
      // Product searching is handled by our backend.
      tool_choice: "none",

      // We don't need reasoning text for this application.
      include_reasoning: false,
    });

    const content = completion.choices[0]?.message?.content;

    return content?.trim() || "";
  });


// ─────────────────────────────────────────────────────────────────────────────
// IMAGE CHAT VIA GEMINI
// ─────────────────────────────────────────────────────────────────────────────

const runImageChat = async (
  imageUrl,
  message,
  history,
  userName
) =>
  runGemini(async (model) => {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch image");
    }

    const base64Data = Buffer.from(
      await response.arrayBuffer()
    ).toString("base64");

    const mimeType =
      response.headers.get("content-type") || "image/jpeg";

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            {
              text: buildSystemPrompt(userName),
            },
          ],
        },

        {
          role: "model",
          parts: [
            {
              text: "Understood! I'm ReWear AI, ready to help.",
            },
          ],
        },

        ...history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [
            {
              text: m.content,
            },
          ],
        })),
      ],
    });

    const result = await chat.sendMessage([
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },

      {
        text:
          message ||
          "What is this item? Help me estimate its resale price.",
      },
    ]);

    return result.response.text().trim();
  });


// ─────────────────────────────────────────────────────────────────────────────
// PRICE ESTIMATE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const isPriceEstimateComplete = (parsed) => {
  const unknown = (value) =>
    !value ||
    value === "unknown" ||
    value === "null" ||
    value === "undefined";

  return (
    Number(parsed.originalPrice) > 0 &&
    Number(parsed.estimatedPrice) > 0 &&
    !unknown(parsed.usageDuration) &&
    !unknown(parsed.usageFrequency) &&
    !unknown(parsed.damage)
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// SAFE JSON EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

const extractJSON = (text) => {
  if (!text || typeof text !== "string") {
    return null;
  }

  try {
    return JSON.parse(text.trim());
  } catch (_) {
    // Continue below and try extracting an object.
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (_) {
    return null;
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// MAIN AI CHAT HANDLER
// ─────────────────────────────────────────────────────────────────────────────

const handleAIChat = async (req, res) => {
  const {
    message,
    imageUrl,
    conversationHistory = [],
    userName,
  } = req.body;

  if (!message && !imageUrl) {
    return res.status(400).json({
      message: "No message or image provided.",
    });
  }

  try {
    let aiText;

    // ───────────────────────────────────────────────────────────────────────
    // IMAGE → GEMINI
    // ───────────────────────────────────────────────────────────────────────

    if (imageUrl) {
      console.log("🖼️ Image detected — routing to Gemini");

      aiText = await runImageChat(
        imageUrl,
        message,
        conversationHistory.slice(-20),
        userName
      );
    }

    // ───────────────────────────────────────────────────────────────────────
    // TEXT → GROQ
    // ───────────────────────────────────────────────────────────────────────

    else {
      console.log("💬 Text message — routing to Groq");

      const groqMessages = [
        {
          role: "system",
          content: buildSystemPrompt(userName),
        },

        ...conversationHistory.slice(-20).map((m) => ({
          role:
            m.role === "assistant"
              ? "assistant"
              : "user",
          content: m.content,
        })),

        {
          role: "user",
          content: message,
        },
      ];

      aiText = await runTextChat(groqMessages);
    }


    console.log("🤖 AI response:", aiText);


    // ───────────────────────────────────────────────────────────────────────
    // PARSE AI JSON ACTION
    // ───────────────────────────────────────────────────────────────────────

    const parsed = extractJSON(aiText);

    if (parsed) {

      // ─────────────────────────────────────────────────────────────────────
      // PRODUCT SEARCH
      // ─────────────────────────────────────────────────────────────────────

      if (parsed.action === "search") {

        const query = String(
          parsed.query || ""
        ).trim();

        const filter = {
          status: "approved",
        };

        // Maximum selling price
        if (
          parsed.maxPrice !== null &&
          parsed.maxPrice !== undefined &&
          Number(parsed.maxPrice) > 0
        ) {
          filter.sellingPrice = {
            $lte: Number(parsed.maxPrice),
          };
        }

        // Category
        if (
          parsed.category &&
          parsed.category !== "null"
        ) {
          filter.category = {
            $regex: String(parsed.category),
            $options: "i",
          };
        }

        // ───────────────────────────────────────────────────────────────────
        // SEARCH REAL MONGODB INVENTORY
        // ───────────────────────────────────────────────────────────────────

        const searchConditions = [];

        if (query) {
          searchConditions.push(
            {
              title: {
                $regex: query,
                $options: "i",
              },
            },
            {
              brand: {
                $regex: query,
                $options: "i",
              },
            },
            {
              category: {
                $regex: query,
                $options: "i",
              },
            },
            {
              description: {
                $regex: query,
                $options: "i",
              },
            }
          );
        }

        const products = await Product.find({
          ...filter,

          ...(searchConditions.length
            ? { $or: searchConditions }
            : {}),
        })
          .limit(6)
          .select(
            "_id title brand sellingPrice images category condition size"
          );

        console.log(
          `🔎 Inventory search: "${query}" | ` +
          `maxPrice: ${parsed.maxPrice} | ` +
          `category: ${parsed.category} | ` +
          `results: ${products.length}`
        );

        return res.json({
          type: "products",

          products,

          message: products.length
            ? `Found ${products.length} item${
                products.length > 1 ? "s" : ""
              } for "${query}" 🛍️`
            : `No products found for "${query}". Try different keywords like the brand or category.`,
        });
      }


      // ─────────────────────────────────────────────────────────────────────
      // PRICE ESTIMATE
      // ─────────────────────────────────────────────────────────────────────

      if (parsed.action === "priceEstimate") {

        if (!isPriceEstimateComplete(parsed)) {
          return res.json({
            type: "text",
            message: aiText,
          });
        }

        return res.json({
          type: "priceEstimate",
          data: parsed,
        });
      }
    }


    // ─────────────────────────────────────────────────────────────────────────
    // NORMAL TEXT RESPONSE
    // ─────────────────────────────────────────────────────────────────────────

    return res.json({
      type: "text",
      message: aiText,
    });

  } catch (err) {

    console.error(
      "AI Chat Error:",
      err?.message || err
    );

    const isQuota =
      err?.message === "QUOTA_EXHAUSTED" ||
      err?.message?.toLowerCase?.().includes("quota") ||
      err?.status === 429;

    res.status(isQuota ? 503 : 500).json({
      message: isQuota
        ? "AI is taking a short break. Please try again in a few minutes ☕"
        : "AI service temporarily unavailable",
    });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  handleAIChat,
  uploadAIImage,
};