# Writing a message

## Parts, skills and commands by name

| Write | For |
|---|---|
| @ | A part of the model, or a picture of the [inspiration board](working-with-the-agent.md#the-inspiration-board) |
| $ | A skill of the Claude Code on your machine |
| / | A command, at the start of a message |

Write @ and a list of the model's parts comes up over the box: the arrow keys move
through it, and Enter or Tab puts the part in, by its id. While the list is up the view
shows where each part is: the one the list is on is drawn solid and everything else
see-through, whatever the shading, and the view goes back to how it was when the list
goes.

Above the parts are the pictures of the project's
[inspiration board](working-with-the-agent.md#the-inspiration-board), large enough to
tell apart, the newest first; what is written after the @ looks through them by name.
Choosing one puts it on the message in place of the @, as if it were
[pasted there](#pictures): "like [Image 1], but smaller".

$ does the same for the skills of the Claude Code on your machine (your own, the
project's, a plugin's), and Claude loads the skill you name before it starts on the
work.

A message that begins with / is a command: any that you, the project or a plugin have
given Claude Code, and three of its own that mean something here (compact, context and
usage). Esc puts the list away.

$ and / are Claude's: with another agent answering, no list comes up, and they go as they were typed.

## What was said of parts

What you say of a part in the view, and the parts you add to chat from it, show as chips
on the message box and go with the next message. [Picking parts out](selecting.md) says
how.

## What was said of the agent's words

Select words in one of the agent's answers and **Quote** comes up by them. Press it, and a
box opens beside the words, the one a part has: write what you say to them (your answer,
where something was asked there, or what you want made clear) and Enter keeps it for the
next message, as a chip on the message box. Nothing is sent by that. More can be quoted
the same way, each with what you say to it, and they all go with the message when you
send it. Cmd+Enter in the box sends at once, with everything that is waiting; Esc, or
Cancel, leaves things as they were.

Words can be quoted with nothing said of them: the message then says the rest. Click a
chip to change what was said, and its cross takes the quote back off the message. A
message that was sent shows how each quote begins, in one line, over what was said to
it. The agent gets all of the words you picked out, with what you said to each.

## Pictures

A message can take pictures with it: a photo of the thing to make, a sketch, a drawing
with its sizes on it. Paste one into the message box, drop it on the window, or pick it
with the paperclip beside the send button. Each shows small over what you write, with a
cross that takes it back off; click one to see it big.

A picture that is pasted also leaves its mark where the caret was, [Image 1], so that
the words can say which picture they mean ("the body of [Image 1] with the knob of
[Image 2]"), and Backspace at the mark takes the picture with it. One message takes
eight, and one too big for an agent is made smaller first.

The agent gets each picture under its name, ahead of the words. It is told to make what a
picture shows, part by part and in its proportions, to take sizes from what is written
on it or said with it and not from how it looks, and to set a screenshot of what it
built beside the picture before it reports.

A message that was sent shows its pictures over what it said. They are kept with the
app's own state, not in the project's folder, for as long as the project is on the list.
Grok and opencode cannot see them: they get your words, and the conversation says so.

## While the agent is at work

More can be said in a conversation the agent is at work in. It waits its turn, marked
Queued, and is sent when the turn is over. A message that waits can be sent at once
(Send now), which stops the turn for it, or taken back. After a turn that was stopped or
that failed, what waits is not sent by itself: it is left for you to send, or goes after
the next turn that gets through. What waits is kept only while the app is open.

A message sent in another of the project's conversations while the agent is at work in
one is not sent: the agent works in one at a time. It comes back to the message box as
it was, with the parts, quotes and pictures that went with it, and the foot of the view
says why; send it once the turn is over.
