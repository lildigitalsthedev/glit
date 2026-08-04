import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { chatWithRepo } from "@/lib/ai.functions";

interface Message {
  role: "user" | "assistant";
  content: string;
  filesUsed?: string[];
}

/**
 * AI Repository Chat (Pro).
 * Allows asking questions about the active codebase branch using custom AI providers.
 */
export function AiRepoChatDialog({
  open,
  onOpenChange,
  accountId,
  fullName,
  branch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  fullName: string;
  branch: string;
}) {
  const chatFn = useServerFn(chatWithRepo);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useMutation({
    mutationFn: ({
      questionText,
      history,
    }: {
      questionText: string;
      history: { role: "user" | "assistant"; content: string }[];
    }) =>
      chatFn({
        data: {
          accountId,
          fullName,
          branch,
          question: questionText,
          history,
        },
      }),
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          filesUsed: result.filesUsed,
        },
      ]);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to query repository.");
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chat.isPending]);

  function handleSend() {
    const trimmed = question.trim();
    if (!trimmed || !branch || chat.isPending) return;

    const historyPayload = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setQuestion("");

    chat.mutate({
      questionText: trimmed,
      history: historyPayload,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuestion("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            Ask about this repo
          </DialogTitle>
          <DialogDescription>
            Uses your own AI provider to analyze repository files —{" "}
            <Link to="/profile" className="underline">
              manage providers
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <div
            ref={scrollRef}
            className="flex max-h-96 min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border bg-card/50 p-3"
          >
            {messages.length === 0 ? (
              <div className="my-auto text-center text-xs text-muted-foreground">
                Ask questions about file architecture, component logic, or route definitions in{" "}
                <span className="font-mono text-foreground">{branch || "this branch"}</span>.
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground font-mono"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {msg.role === "assistant" && msg.filesUsed && msg.filesUsed.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <FileCode className="size-3 shrink-0" />
                      <span>Referenced: {msg.filesUsed.join(", ")}</span>
                    </div>
                  )}
                </div>
              ))
            )}

            {chat.isPending && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground font-mono max-w-[85%]">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Analyzing repository...
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Where is authentication implemented?"
              className="min-h-20 text-xs"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Press <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Enter</kbd> to send
              </p>
              <Button
                size="sm"
                disabled={!branch || chat.isPending || !question.trim()}
                onClick={handleSend}
              >
                {chat.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}