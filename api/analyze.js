import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SHOT_PHASES = {
  forehand: ['Stance', 'Backswing', 'Contact Point', 'Follow-Through'],
  backhand: ['Unit Turn', 'Backswing', 'Contact Point', 'Follow-Through'],
  serve:    ['Trophy Position', 'Ball Toss', 'Contact', 'Follow-Through'],
  volley:   ['Ready Position', 'Preparation', 'Contact', 'Recovery'],
};

function buildPrompt(shotType, phases) {
  const baseJson = `{
  "overall_score": <0-100>,
  "phases": [
    { "name": "${phases[0]}", "score": <0-100>, "issues": ["<issue>"], "tip": "<one fix>" },
    { "name": "${phases[1]}", "score": <0-100>, "issues": ["<issue>"], "tip": "<one fix>" },
    { "name": "${phases[2]}", "score": <0-100>, "issues": ["<issue>"], "tip": "<one fix>" },
    { "name": "${phases[3]}", "score": <0-100>, "issues": ["<issue>"], "tip": "<one fix>" }
  ],
  "coaching": "<2-3 sentence overall summary>"`;

  const topspinExtra = shotType === 'forehand' ? `,
  "topspin": {
    "score": <0-100>,
    "swing_path": <0-100>,
    "contact_height": <0-100>,
    "brush_angle": <0-100>,
    "follow_through_height": <0-100>
  }` : '';

  const shotContext = {
    forehand: `Forehand topspin groundstroke. Key topspin indicators: low-to-high swing path (angle >30°), contact point in front of body at waist-to-shoulder height, racket face slightly closed at contact, high follow-through over opposite shoulder. Award topspin sub-scores: swing_path (how much low-to-high), contact_height (waist=ideal), brush_angle (racket face closure), follow_through_height (finish height).`,
    backhand: `Backhand groundstroke (detect 1-hand or 2-hand). Key indicators: early unit turn (Frame 1), full shoulder rotation in backswing, contact in front of lead hip, extended follow-through. Note in issues if grip or stance is wrong for the type used.`,
    serve: `Tennis serve. Key indicators — Trophy Position: tossing arm up, racket in back-scratch, weight coiled; Ball Toss: ball released slightly in front of hitting shoulder; Contact: full arm extension at peak, leg drive transferred; Follow-Through: racket swings down past left side, body lands inside baseline.`,
    volley: `Net volley. Key indicators: Ready Position: split step, racket up; Preparation: minimal/compact backswing only; Contact: punch motion, meet ball in front, firm wrist; Recovery: immediate reset to ready position. Penalise any large backswing.`,
  };

  return `You are an expert tennis coach. You have 4 video frames in chronological order:
Frame 1=${phases[0]}, Frame 2=${phases[1]}, Frame 3=${phases[2]}, Frame 4=${phases[3]}.

Shot type: ${shotContext[shotType] || shotContext.forehand}

Respond ONLY with valid JSON (no markdown):
${baseJson}${topspinExtra}
}

Scoring: 90-100=professional, 75-89=strong, 60-74=developing, 40-59=beginner, <40=significant issues.
Keep issues array empty [] if phase looks correct. Maximum 2 issues per phase.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { frames, mediaType = 'image/jpeg', shotType = 'forehand' } = req.body || {};
  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'No frames provided' });
  }

  const phases = SHOT_PHASES[shotType] || SHOT_PHASES.forehand;

  try {
    const content = frames.slice(0, 4).map(f => ({
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${f}` },
    }));
    content.push({ type: 'text', text: buildPrompt(shotType, phases) });

    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1400,
      messages: [{ role: 'user', content }],
    });

    const text = response.choices[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse AI response' });

    return res.status(200).json({ ...JSON.parse(jsonMatch[0]), shotType });
  } catch (err) {
    console.error('Analyze error:', err.message);
    return res.status(500).json({ error: err.message || 'Analysis failed' });
  }
}
