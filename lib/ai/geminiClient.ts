import { GoogleGenAI } from "@google/genai";
import { config } from "../config";

let client: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: config.geminiApiKey(),
    });
  }
  return client;
}


