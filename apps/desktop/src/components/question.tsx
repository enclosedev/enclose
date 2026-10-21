import * as React from "react"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

import type { Project, Question, ThreadItem } from "@shared/api"
import { REACH } from "@/components/steps"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { answerOf, NOTHING, pick, write, type Said } from "@/lib/questions"

/** One of the answers Claude offers, to be clicked: what it is, and what it comes to. */
function Option({
  option,
  several,
  on,
  onClick,
}: {
  option: Question["options"][number]
  several: boolean
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role={several ? "checkbox" : "radio"}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "relative flex items-center rounded-xl py-2 pr-8 pl-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none",
        on ? "bg-muted ring-1 ring-foreground/15" : "bg-muted/60 hover:bg-muted"
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{option.label}</span>
        {option.detail && (
          <span className="text-muted-foreground">{option.detail}</span>
        )}
      </span>
      {on && (
        <CheckIcon
          size={16}
          absoluteStrokeWidth
          strokeWidth={1}
          className="absolute right-2.5 shrink-0"
          aria-hidden
        />
      )}
    </button>
  )
}

/**
 * What Claude asks before it goes on, one question at a time. Each has its likely
 * answers to click, and a line for an answer of one's own. A click on an answer goes on
 * to the next question, where one answer is all the question takes; the last of them
 * sends what was said to them all. Once that is done, what shows is what was said to each.
 */
export function QuestionCard({
  item,
  project,
}: {
  item: Extract<ThreadItem, { kind: "question" }>
  project: Project
}) {
  const { questions } = item
  const [said, setSaid] = React.useState<Said[]>(() =>
    questions.map(() => NOTHING)
  )
  /** which of them is being asked just now */
  const [at, setAt] = React.useState(0)
  // sent, and not yet heard back of: it is not to be sent twice
  const [sent, setSent] = React.useState(false)
  const whole = React.useRef<HTMLDivElement>(null)
  // one question is not as tall as the next: the one come to is brought whole into view
  React.useEffect(() => {
    whole.current?.scrollIntoView({ block: "nearest" })
  }, [at])
  const CARD = cn(
    "flex scroll-my-6 flex-col rounded-2xl bg-card py-3.5 ring-1 ring-foreground/10",
    REACH
  )

  const question = questions[at]
  if (item.state !== "pending" || !question)
    return (
      <div className={cn(CARD, "gap-2.5")}>
        {questions.map((asked, index) => (
          <div key={index} className="flex flex-col text-sm">
            <span className="text-muted-foreground">{asked.question}</span>
            {item.state === "answered" && (
              <span className="font-medium">
                {item.answers[index] || "Left to Claude"}
              </span>
            )}
          </div>
        ))}
        {item.state === "skipped" && (
          <div className="text-xs text-muted-foreground">Skipped</div>
        )}
      </div>
    )

  const mine = said[at] ?? NOTHING
  const last = at === questions.length - 1
  const set = (now: Said) =>
    setSaid(said.map((one, index) => (index === at ? now : one)))
  /** Go on from this question with `now` said to it: to the next, or to sending them all. */
  const goOn = (now: Said) => {
    const all = said.map((one, index) => (index === at ? now : one))
    setSaid(all)
    if (!last) return setAt(at + 1)
    setSent(true)
    void window.cad.thread.tell(project.id, item.id, all.map(answerOf))
  }

  return (
    <div ref={whole} className={cn(CARD, "gap-3.5")}>
      <fieldset
        key={at}
        disabled={sent}
        className="flex min-w-0 flex-col gap-1.5"
      >
        <legend className="mb-2.5 flex flex-col gap-1 text-sm font-medium">
          {questions.length > 1 && (
            <span className="text-xs font-normal text-muted-foreground">
              {at + 1} of {questions.length}
            </span>
          )}
          {question.question}
        </legend>
        {question.options.map((option) => (
          <Option
            key={option.label}
            option={option}
            several={question.several}
            on={mine.picked.includes(option.label)}
            onClick={() => {
              const now = pick(question, mine, option.label)
              if (question.several) set(now)
              else goOn(now)
            }}
          />
        ))}
        <Input
          aria-label="Another answer"
          placeholder="Something else…"
          value={mine.written}
          onChange={(event) => set(write(question, mine, event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && answerOf(mine)) goOn(mine)
          }}
          className="h-9 rounded-xl px-3"
        />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        {/* a click answers, where one answer is all it takes: there is something to
            go on with only once it is written, or was said before and come back to */}
        {(question.several || answerOf(mine) !== "") && (
          <Button
            size="sm"
            disabled={answerOf(mine) === "" || sent}
            onClick={() => goOn(mine)}
          >
            {last ? "Send" : "Next"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={sent}
          onClick={() => goOn(NOTHING)}
        >
          Skip
        </Button>
        {at > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={sent}
            className="ml-auto"
            onClick={() => setAt(at - 1)}
          >
            Back
          </Button>
        )}
      </div>
    </div>
  )
}
