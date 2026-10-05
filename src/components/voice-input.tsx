"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, MicOff } from "lucide-react";
import { Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const LANG: Record<string, string> = { uz: "uz-UZ", "uz-Cyrl": "uz-UZ", ru: "ru-RU", en: "en-US" };

/**
 * Text field with a voice-note button (browser speech-to-text). Speech is appended to the text, which the
 * user can still edit before saving. Hidden where the browser has no speech recognition.
 */
export function VoiceField({
  name,
  placeholder,
  required,
  multiline = false,
  defaultValue,
  className,
}: {
  name: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  defaultValue?: string;
  className?: string;
}) {
  const t = useTranslations("voice");
  const locale = useLocale();
  const [value, setValue] = useState(defaultValue ?? "");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount (not available during SSR)
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = LANG[locale] ?? "uz-UZ";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text) setValue((v) => (v ? `${v.trimEnd()} ${text.trim()}` : text.trim()));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const Field = multiline ? Textarea : Input;
  return (
    <div className={cn("relative flex-1", className)}>
      <Field name={name} value={value} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setValue(e.target.value)} placeholder={placeholder} required={required} className={supported ? "pr-10" : undefined} />
      {supported && (
        <button
          type="button"
          onClick={toggle}
          title={listening ? t("stop") : t("start")}
          aria-label={listening ? t("stop") : t("start")}
          className={cn("absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md", listening ? "animate-pulse bg-danger text-white" : "text-muted hover:bg-surface-2 hover:text-text")}
        >
          {listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
