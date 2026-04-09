const { Readable } = require("stream");
const { runWithFallback: runGroq } = require("../config/groq");
const { runWithFallback: runGemini } = require("../config/gemini");
const Product = require("../models/Product");
const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "rewear/ai-chat", resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });

// ── Base system prompt ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ReWear AI — a smart, friendly assistant for ReWear, a pre-loved branded fashion marketplace in India. Prices are always in ₹.

━━━ MODE 1: PRODUCT SEARCH ━━━
When user describes what they want to buy, output ONLY this JSON:
{"action":"search","query":"<term>","maxPrice":<number|null>,"category":"<category|null>"}
- For vague requests like "something nice for college" or "casual outfit", pick the most relevant search term.
- If no results, suggest trying a different brand, category, or relaxing the price filter.
- Never invent products — only search the real database.

━━━ MODE 2: PRICE ESTIMATOR ━━━
Help user estimate resale value of an item they want to sell.
Ask questions ONE AT A TIME in this exact order (skip any already answered):
  a) "What was the original purchase price? (in ₹)"
  b) "How long have you used it? (e.g. 6 months, 2 years)"
  c) "How often did you use it? (daily / weekly / rarely)"
  d) "Any visible damage? (tears, stains, fading, or none)"

Once you have ALL FOUR answers, output ONLY this JSON (no extra text):
{"action":"priceEstimate","item":"<n>","originalPrice":<number>,"usageDuration":"<text>","usageFrequency":"<text>","damage":"<text>","estimatedPrice":<number>,"breakdown":{"baseDepreciation":"<e.g. 45% depreciation after 1 year of weekly use>","conditionAdjustment":"<e.g. Minor fading reduces value by 10%>","brandMultiplier":"<e.g. Zara holds resale value well, no penalty>"}}

Price estimate rules:
- Never output the priceEstimate JSON unless ALL FOUR fields are known.
- If user gives all info at once, estimate immediately without asking questions.
- Once a price card is shown, never output the priceEstimate JSON again for the same item unless user explicitly says "re-estimate" or gives new details.
- If user disagrees with the estimate, acknowledge it in plain text and explain your reasoning briefly. Do not re-render the card.
- If user says they will sell at a higher price than your estimate, respect their decision. Give a brief honest opinion (e.g. "Market rate is ₹3500 but listing at ₹5000 is fine — it may take longer to sell") but never re-estimate or output the JSON again.
- If user mentions limited edition, rare collab, or premium condition, factor it in and explain in plain text — do not re-render the card unless they ask.
- Consider brand value: premium brands (Nike, Adidas, Zara, H&M, Levi's, etc.) depreciate slower than no-name brands.

━━━ MODE 3: PLATFORM GUIDE ━━━
Answer questions about ReWear in 2–3 friendly sentences.

LISTING:
- Go to Seller Dashboard → List Product → upload photos, fill brand/price/size/condition → submit for admin verification → goes live once approved.
- Listings are typically verified within 24 hours.
- If listing is rejected, you'll get a reason — fix it and resubmit.
- To edit or delete a listing, go to Seller Dashboard → My Listings.

NEGOTIATION:
- Open any product → tap Chat → tap 🏷️ Negotiate → drag slider to your offer price → send.
- Seller can accept, counter, or decline.
- If offer expires with no response, feel free to send a new one.
- As a seller, if the offer is too low, always counter rather than ignore — it builds trust.

PAYMENT:
- After a deal is agreed in chat → tap Pay → 3-step checkout: address → review → Razorpay.
- Supported: UPI, cards, net banking, wallets via Razorpay.
- If payment fails, retry from My Orders or contact support.
- Sellers receive payment after the buyer confirms delivery.

ORDERS & DELIVERY:
- Track orders at My Orders: Pending → Confirmed → Packed → Shipped → Delivered.
- If order is stuck on a status for too long, contact support via the Help section.
- If wrong item received or item not as described, raise a dispute from My Orders within 48 hours of delivery.
- If order shows delivered but wasn't received, report it immediately from My Orders.
- Returns and refunds are handled case by case — raise a dispute and the ReWear team will review.

ACCOUNT & TRUST:
- To report a fake listing or scammer: tap 🚩 flag icon in navbar or use the Report link in the footer.
- If you've been scammed, report immediately via 🚩 and contact support — never send money outside the platform.
- To block a user, go to their profile → tap ⋮ → Block.
- Privacy policy is at /privacy-policy — your data is never sold to third parties.
- Notifications are shown via the 🔔 bell icon in the top bar.

━━━ EDGE CASES & EMOTIONAL HANDLING ━━━
- If user is frustrated or angry, stay calm, empathetic, and solution-focused. Acknowledge their frustration first before giving info.
- If user asks something off-topic (weather, jokes, general knowledge), politely say you're here for fashion and ReWear help, and redirect.
- If user asks "are you real?" or "are you a bot?", say you're ReWear AI — a virtual assistant — and offer to help.
- If user asks you to place an order, process a payment, or take any action on their account, explain you can only guide them and they need to do it themselves in the app.
- If user gives contradictory info (e.g. says item is new but also heavily used), gently point it out and ask to clarify.
- If user keeps repeating the same question, give the same answer patiently without showing frustration.
- If user asks about a cancelled, refunded, or disputed order, guide them to My Orders and the Help/Support section.

━━━ GENERAL RULES ━━━
- Always reply in the same language the user is using. If they switch languages mid-conversation, switch with them.
- Remember the full conversation — never ask for info the user already gave.
- Be warm, concise, and fashion-aware. Max 3–4 sentences for guide answers unless more detail is needed.
- For searches and complete price estimates, output ONLY the JSON — no extra text.
- Never make up features, policies, or products that don't exist on ReWear.`;

// ── Inject user name into prompt ──────────────────────────────────────────────
const buildSystemPrompt = (name) => {
  const greeting = name
    ? `\n\nThe user's name is ${name}. Greet them by name naturally at the start of a conversation or when it feels friendly — but don't force it into every message.`
    : '';
  return `${SYSTEM_PROMPT}${greeting}`;
};

// ── Upload image ──────────────────────────────────────────────────────────────
const uploadAIImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const result = await uploadToCloudinary(req.file.buffer);
    res.json({ imageUrl: result.secure_url });
  } catch (err) {
    console.error("AI Image Upload Error:", err.message);
    res.status(500).json({ message: "Image upload failed", error: err.message });
  }
};

// ── Text chat via Groq ────────────────────────────────────────────────────────
const runTextChat = async (messages) =>
  runGroq(async (groq, modelName) => {
    const completion = await groq.chat.completions.create({
      model:       modelName,
      messages,
      max_tokens:  400,
      temperature: 0.6,
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  });

// ── Image chat via Gemini ─────────────────────────────────────────────────────
const runImageChat = async (imageUrl, message, history, userName) =>
  runGemini(async (model) => {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to fetch image");
    const base64Data = Buffer.from(await response.arrayBuffer()).toString("base64");
    const mimeType   = response.headers.get("content-type") || "image/jpeg";

    const chat = model.startChat({
      history: [
        { role: "user",  parts: [{ text: buildSystemPrompt(userName) }] },
        { role: "model", parts: [{ text: "Understood! I'm ReWear AI, ready to help." }] },
        ...history.map((m) => ({
          role:  m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      ],
    });

    const result = await chat.sendMessage([
      { inlineData: { data: base64Data, mimeType } },
      { text: message || "What is this item? Help me estimate its resale price." },
    ]);
    return result.response.text().trim();
  });

// ── Guard: only render price card if all fields are present ───────────────────
const isPriceEstimateComplete = (parsed) => {
  const unknown = (v) => !v || v === "unknown" || v === "null" || v === "undefined";
  return (
    parsed.originalPrice > 0 &&
    parsed.estimatedPrice > 0 &&
    !unknown(parsed.usageDuration) &&
    !unknown(parsed.usageFrequency) &&
    !unknown(parsed.damage)
  );
};

// ── Main AI chat handler ──────────────────────────────────────────────────────
const handleAIChat = async (req, res) => {
  const { message, imageUrl, conversationHistory = [], userName } = req.body;

  if (!message && !imageUrl)
    return res.status(400).json({ message: "No message or image provided." });

  try {
    let aiText;

    if (imageUrl) {
      console.log("🖼️  Image detected — routing to Gemini");
      aiText = await runImageChat(imageUrl, message, conversationHistory.slice(-20), userName);
    } else {
      console.log("💬 Text message — routing to Groq");
      const groqMessages = [
        { role: "system", content: buildSystemPrompt(userName) },
        ...conversationHistory.slice(-20).map((m) => ({
          role:    m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        { role: "user", content: message },
      ];
      aiText = await runTextChat(groqMessages);
    }

    // ── Parse JSON actions ───────────────────────────────────────────────────
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.action === "search") {
          const query  = parsed.query || "";
          const filter = { status: "approved" };
          if (parsed.maxPrice) filter.sellingPrice = { $lte: Number(parsed.maxPrice) };
          if (parsed.category) filter.category     = { $regex: parsed.category, $options: "i" };

          const products = await Product.find({
            ...filter,
            $or: [
              { title:       { $regex: query, $options: "i" } },
              { brand:       { $regex: query, $options: "i" } },
              { category:    { $regex: query, $options: "i" } },
              { description: { $regex: query, $options: "i" } },
            ],
          })
            .limit(6)
            .select("_id title brand sellingPrice images category condition size");

          return res.json({
            type:     "products",
            products,
            message:  products.length
              ? `Found ${products.length} item${products.length > 1 ? "s" : ""} for "${query}" 🛍️`
              : `No products found for "${query}". Try different keywords like the brand or category.`,
          });
        }

        if (parsed.action === "priceEstimate") {
          if (!isPriceEstimateComplete(parsed)) {
            return res.json({ type: "text", message: aiText });
          }
          return res.json({ type: "priceEstimate", data: parsed });
        }
      }
    } catch (_) {}

    return res.json({ type: "text", message: aiText });

  } catch (err) {
    console.error("AI Chat Error:", err.message);
    const isQuota = err?.message === "QUOTA_EXHAUSTED" || err?.message?.includes("quota");
    res.status(isQuota ? 503 : 500).json({
      message: isQuota
        ? "AI is taking a short break. Please try again in a few minutes ☕"
        : "AI service temporarily unavailable",
    });
  }
};

module.exports = { handleAIChat, uploadAIImage };