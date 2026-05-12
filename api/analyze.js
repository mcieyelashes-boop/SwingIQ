import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mediaType = 'image/jpeg' } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert tennis coach analyzing a player's swing from a video frame.

Analyze the tennis swing technique visible in this image and respond ONLY with valid JSON in this exact format:
{
  "score": <overall score 0-100>,
  "metrics": {
    "stance": <0-100>,
    "backswing": <0-100>,
    "impact": <0-100>,
    "follow_through": <0-100>
  },
  "issues": [<list of 1-3 specific issues as short strings, empty array if none>],
  "coaching": "<2-3 sentences of actionable coaching advice>"
}

Scoring guide:
- 90-100: Professional form
- 75-89: Strong recreational player
- 60-74: Developing player with good fundamentals
- 40-59: Beginner with several areas to improve
- Below 40: Significant technique issues

If the image doesn't clearly show a tennis swing, return score 0 with coaching explaining the image wasn't clear.`;

    const result = await model.generateContent([
      { inlineData: { mimeType: mediaType, data: image } },
      prompt,
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse AI response' });
    }

    const data = JSON.parse(jsonMatch[0]);
    return res.status(200).json(data);
  } catch (err) {
    console.error('Analyze error:', err.message);
    return res.status(500).json({ error: err.message || 'Analysis failed' });
  }
}
