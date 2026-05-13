import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { frames, mediaType = 'image/jpeg' } = req.body || {};
  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'No frames provided' });
  }

  const phaseNames = ['Stance', 'Backswing', 'Contact Point', 'Follow-Through'];
  const frameCount = Math.min(frames.length, 4);

  try {
    // Build content array: images first, then the analysis prompt
    const content = [];

    for (let i = 0; i < frameCount; i++) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${mediaType};base64,${frames[i]}` },
      });
    }

    content.push({
      type: 'text',
      text: `You are an expert tennis coach. You have been given ${frameCount} frames from a tennis swing video in chronological order.
Frame 1 = ${phaseNames[0]}
Frame 2 = ${phaseNames[1]}
Frame 3 = ${phaseNames[2]}
Frame 4 = ${phaseNames[3]}

Analyze each frame carefully and respond ONLY with valid JSON in exactly this format (no markdown, no explanation):
{
  "overall_score": <0-100>,
  "phases": [
    {
      "name": "Stance",
      "score": <0-100>,
      "issues": ["<specific issue 1>", "<specific issue 2>"],
      "tip": "<one actionable correction sentence>"
    },
    {
      "name": "Backswing",
      "score": <0-100>,
      "issues": ["<specific issue>"],
      "tip": "<one actionable correction sentence>"
    },
    {
      "name": "Contact Point",
      "score": <0-100>,
      "issues": ["<specific issue>"],
      "tip": "<one actionable correction sentence>"
    },
    {
      "name": "Follow-Through",
      "score": <0-100>,
      "issues": ["<specific issue>"],
      "tip": "<one actionable correction sentence>"
    }
  ],
  "coaching": "<2-3 sentence overall coaching summary focusing on the most important improvements>"
}

Scoring: 90-100=professional, 75-89=strong, 60-74=developing, 40-59=beginner, <40=significant issues.
If a frame is unclear, give a fair estimate based on body position visible. Keep issues array empty if the phase looks good.`,
    });

    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1200,
      messages: [{ role: 'user', content }],
    });

    const text = response.choices[0]?.message?.content || '';
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
