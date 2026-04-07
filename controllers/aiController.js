const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Readable } = require("stream");
const Product = require("../models/Product");
const cloudinary = require("../config/cloudinary");

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);

let currentKeyIndex = 0;

const getModel = () => {
  const genAI = new GoogleGenerativeAI(API_KEYS[currentKeyIndex]);
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
};

const rotateKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
};

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "rewear/ai-chat", resource_type: "image" },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });
};

const SYSTEM_PROMPT = `You are ReWear AI — a smart shopping assistant for ReWear, a pre-loved branded fashion marketplace in India.

You help users with:
1. PRODUCT FINDER: When users describe what they want (e.g., "shoes under 1000", "Nike t-shirt"), respond ONLY with this exact JSON:
{"action":"search","query":"<extracted search term>","maxPrice":<number or null>,"category":"<if mentioned or null>"}

2. PRICE ESTIMATOR: Help users estimate resale price for items they want to sell.
   - If they upload an image or mention an item with condition details, estimate price.
   - Ask condition questions ONE AT A TIME:
     a) "How long have you used it? (days/months/years)"
     b) "How often did you use it? (daily/weekly/rarely)"
     c) "Any visible damage? (tears, stains, fading, none)"
   - Once you have all info, respond ONLY with this JSON:
   {"action":"priceEstimate","item":"<name>","originalPrice":<number>,"usageDuration":"<text>","usageFrequency":"<text>","damage":"<text>","estimatedPrice":<number>,"breakdown":{"baseDepreciation":"<text>","conditionAdjustment":"<text>","brandMultiplier":"<text>"}}
   - If user gives all info at once (original price, duration, frequency, damage), skip questions and estimate immediately.

3. PLATFORM GUIDE: Answer questions about how ReWear works:
   - Listing: Go to Seller Dashboard → List Product. Upload images, set price/brand/size/condition. Listing goes to admin for verification before going live.
   - Negotiation: Open any product → click Chat → tap the 🏷️ Negotiate button → drag the slider to set your offer price → send. Seller can accept, counter, or decline.
   - Payment: After a deal is agreed in chat, tap Pay → you'll go through a 3-step checkout (address → review → Razorpay). Pay securely via Razorpay.
   - Tracking: Go to My Orders to see your order status: Pending → Confirmed → Packed → Shipped → Delivered.
   - Privacy: ReWear's Privacy Policy is at /privacy-policy. Your data is never sold to third parties.
   - Notifications: The bell icon (🔔) in the top bar shows your notifications. Click it to see order updates and messages.
   - Reporting: Use the 🚩 flag icon in the navbar or the Report link in the footer to report a listing or seller.

Rules:
- Prices are always in Indian Rupees (₹)
- Be friendly, concise, and fashion-aware
- For searches, ONLY output the JSON — no extra text
- For price estimates with complete info, output ONLY the JSON
- For guides, respond in plain helpful text (2-4 sentences max)
- Never make up products — only search the real database`;

// ── Upload image to Cloudinary ────────────────────────────────────────────────
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

// ── AI Chat ───────────────────────────────────────────────────────────────────
const handleAIChat = async (req, res) => {
  const { message, imageUrl, conversationHistory = [] } = req.body;

  const history = conversationHistory.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let userParts = [];

  // ── Handle image from Cloudinary URL ──────────────────────────────────────
  if (imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error("Failed to fetch image from Cloudinary");
      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString("base64");
      const mimeType = response.headers.get("content-type") || "image/jpeg";
      userParts.push({ inlineData: { data: base64Data, mimeType } });
    } catch (imgErr) {
      console.error("Image fetch error:", imgErr.message);
      return res.status(400).json({ message: "Failed to process image. Please try again." });
    }
  }

  if (message) userParts.push({ text: message });

  if (userParts.length === 0) {
    return res.status(400).json({ message: "No message or image provided." });
  }

  let lastError;

  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    try {
      const model = getModel();

      const chat = model.startChat({
        history: [
          { role: "user",  parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Understood! I'm ReWear AI, ready to help find products, estimate resale prices, and guide you around the platform." }] },
          ...history,
        ],
      });

      const result = await chat.sendMessage(userParts);
      const aiText = result.response.text().trim();

      // ── Try to parse JSON action ─────────────────────────────────────────
      try {
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // ── Product Search ───────────────────────────────────────────────
          if (parsed.action === "search") {
            const query = parsed.query || "";

            // Build filter using CORRECT field names from Product model
            const filter = { status: "approved" };
            if (parsed.maxPrice) filter.sellingPrice = { $lte: Number(parsed.maxPrice) };
            if (parsed.category) filter.category = { $regex: parsed.category, $options: "i" };

            const products = await Product.find({
              ...filter,
              $or: [
                { title:       { $regex: query, $options: "i" } },  // ✅ correct field
                { brand:       { $regex: query, $options: "i" } },
                { category:    { $regex: query, $options: "i" } },
                { description: { $regex: query, $options: "i" } },
              ],
            })
              .limit(6)
              .select("_id title brand sellingPrice images category condition size"); // ✅ correct fields

            return res.json({
              type: "products",
              products,
              message: products.length
                ? `Found ${products.length} item${products.length > 1 ? "s" : ""} for "${query}" 🛍️`
                : `No products found for "${query}". Try different keywords like the brand or category.`,
            });
          }

          // ── Price Estimate ───────────────────────────────────────────────
          if (parsed.action === "priceEstimate") {
            return res.json({ type: "priceEstimate", data: parsed });
          }
        }
      } catch (_) {
        // Not JSON — fall through to plain text
      }

      return res.json({ type: "text", message: aiText });

    } catch (err) {
      const isQuotaError =
        err?.status === 429 ||
        err?.message?.includes("quota") ||
        err?.message?.includes("rate");

      if (isQuotaError && attempt < API_KEYS.length - 1) {
        rotateKey();
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      lastError = err;
      break;
    }
  }

  console.error("AI Chat Error:", lastError);
  res.status(500).json({ message: "AI service temporarily unavailable", error: lastError?.message });
};

module.exports = { handleAIChat, uploadAIImage };