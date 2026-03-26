import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, mimeType } = await req.json();
    if (!audio) throw new Error("No audio data provided");

    const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!ELEVENLABS_KEY && !OPENAI_KEY) throw new Error("No transcription API key configured");

    // Decode base64
    const binaryString = atob(audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine extension from MIME
    let extension = "webm";
    const mt = (mimeType || "").toLowerCase();
    if (mt.includes("mp3") || mt.includes("mpeg")) extension = "mp3";
    else if (mt.includes("wav") || mt.includes("wave")) extension = "wav";
    else if (mt.includes("ogg")) extension = "ogg";
    else if (mt.includes("m4a") || mt.includes("x-m4a")) extension = "m4a";
    else if (mt.includes("mp4")) extension = "mp4";
    else if (mt.includes("aac")) extension = "aac";
    else if (mt.includes("quicktime") || mt.includes("mov")) extension = "mov";
    else if (mt.includes("caf")) extension = "caf";
    else if (mt.includes("3gp")) extension = "3gp";
    else if (mt.includes("flac")) extension = "flac";
    else if (mt.includes("aiff")) extension = "aiff";
    else if (mt.includes("matroska") || mt.includes("mkv")) extension = "mkv";

    let transcript = null;
    let provider = null;
    const segments: Array<{speaker: string; text: string; start: number; end: number}> = [];

    // 1) ElevenLabs scribe_v2
    if (ELEVENLABS_KEY && !transcript) {
      try {
        const formData = new FormData();
        const blob = new Blob([bytes], { type: mimeType || "audio/webm" });
        formData.append("file", blob, `audio.${extension}`);
        formData.append("model_id", "scribe_v2");
        formData.append("language_code", "spa");
        formData.append("diarize", "true");
        formData.append("tag_audio_events", "true");

        const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_KEY },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();

          // Build diarized segments from words
          if (result.words && result.words.length > 0) {
            let currentSpeaker = "";
            let segmentWords: string[] = [];
            let segmentStart = 0;
            let segmentEnd = 0;

            for (const word of result.words) {
              const speaker = word.speaker || "Hablante";
              if (speaker !== currentSpeaker && segmentWords.length > 0) {
                segments.push({
                  speaker: currentSpeaker,
                  text: segmentWords.join(" "),
                  start: segmentStart,
                  end: segmentEnd,
                });
                segmentWords = [];
                segmentStart = word.start || 0;
              }
              if (segmentWords.length === 0) segmentStart = word.start || 0;
              currentSpeaker = speaker;
              segmentWords.push(word.text);
              segmentEnd = word.end || 0;
            }
            if (segmentWords.length > 0) {
              segments.push({
                speaker: currentSpeaker,
                text: segmentWords.join(" "),
                start: segmentStart,
                end: segmentEnd,
              });
            }
          }

          transcript = segments.length > 1
            ? segments.map(s => `[${s.speaker}]: ${s.text}`).join("\n\n")
            : result.text || "";
          provider = "elevenlabs";
        } else {
          const errText = await response.text();
          console.error("ElevenLabs error:", response.status, errText);
        }
      } catch (e) { console.error("ElevenLabs failed:", e); }
    }

    // 2) OpenAI Whisper fallback
    if (OPENAI_KEY && !transcript) {
      try {
        const formData = new FormData();
        const blob = new Blob([bytes], { type: mimeType || "audio/webm" });
        formData.append("file", blob, `audio.${extension}`);
        formData.append("model", "whisper-1");
        formData.append("language", "es");
        formData.append("response_format", "text");

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + OPENAI_KEY },
          body: formData,
        });

        if (response.ok) {
          transcript = await response.text();
          provider = "whisper";
        } else {
          const errText = await response.text();
          console.error("Whisper error:", response.status, errText);
        }
      } catch (e) { console.error("Whisper failed:", e); }
    }

    if (!transcript) throw new Error("No transcription service could process the audio");

    return new Response(
      JSON.stringify({ text: transcript, segments, provider }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Transcription failed";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
