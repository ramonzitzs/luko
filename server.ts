import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const resend = new Resend(process.env.RESEND_API_KEY);

  app.use(express.json());

  // API routes
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html } = req.body;
    
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not found in environment variables");
      return res.status(500).json({ error: "Email service not configured" });
    }

    try {
      const data = await resend.emails.send({
        from: "Luko <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: html,
      });
      
      console.log("Email sent successfully:", data);
      res.json({ success: true, data });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
