---
name: product-situations
description: Find every situation a product's screens and journeys must handle besides the usual day - nothing to show, waiting and errors, who is looking, what is typed, limits, time, interruptions, racing, money - and put each on the product map as a real screen. Use when planning a product, drawing or updating its map, building it, or when asked what could go wrong.
---

# Situations: everything besides the usual day

A designer judges a plan by its hard situations: the empty list, the sold-out slot, the payment that failed. A plan
that only shows good days sends them back to their design tools. Finding these is your job, not the person's: they
should never have to list them, only read and decide.

## When

- **Planning**: one full pass right after the first screens exist, before your first question; again whenever an
  answer adds a screen or changes a journey.
- **Drawing or updating the map of existing code**: while you draw each card, record the situations the code handles,
  and propose the ones it does not handle that a product like this must (see "How to record").
- **Building**: every planned situation keeps working on real data; one you find while building goes on the map too.

## How to walk

For every screen card, then for every journey, go down the lists below and ask: can this happen here, and what does
the person see and do next? Skip what cannot happen. Keep what can, even when rare, if it would cost the person money,
data, time or trust.

### On one screen

- **What it shows**: nothing yet; exactly one; a great many (hundreds, more than a page); very long names or texts;
  a missing picture; unusual values (zero, a negative amount, a date far ahead).
- **Waiting and connection**: the first load; slow; offline; the server fails; it times out.
- **Who is looking**: signed out; the sign-in expired; not allowed (someone else's data, a staff-only page); blocked;
  the first visit compared with a regular's.
- **What they type**: nothing; the wrong format; too long; already taken; the same thing twice.
- **Limits**: sold out, full, fully booked; over a quota or a maximum; under a minimum.
- **Time**: closed now; a date in the past; a deadline passed; a holiday.

### Across a journey

- **Interruptions**: the connection drops halfway; the app is closed and opened again; back; refresh; the person
  arrives in the middle from a shared link.
- **Racing**: someone else takes the last item or slot first; the same button pressed twice; two tabs open.
- **Changes afterwards**: cancel, change, refund, undo; the other side deletes or edits what someone relies on.
- **Money**, when there is any: the payment fails, is cancelled, is partly refunded.
- **The other side**: what the other person sees when it happens (the owner when a booking is cancelled).

## How to record

- **A screen's situation**: in the card's `states` as `{id, title, why}`, the title in the person's words ("빵이 하나도
  없을 때"), plus one promise with `state` set to it: what the person sees and can do then.
- **A journey's situation**: in the flow's `situations` as `{id, title, why, screen}`, and the same id in the `states`
  of the screen where it is seen ("예약하는 동안 마지막 자리가 먼저 팔렸을 때", seen on 예약 확인).
- **A planned product**: every situation is real on its screen at `?alpine-state=<id>` (the planning skill's "Writing
  a screen"), on made-up data that produces it.
- **An existing product**: a situation the code handles stays `handled` (the default); when the app can show it at
  `?alpine-state=`, the map shows it as a screen. A situation the code does not handle but a product like this must
  gets `"handled": false`, with `why` saying what happens today ("지금은 빈 화면만 보여요"). Its promise says what it
  should do; never write it as if the product already did. The map shows it as a proposal the person takes or drops.
- **How many**: two to five per screen is usual; a simple page may have none, a payment screen more. The ones that
  would cost the person most come first.

## The bar

Each situation answers three things on its screen, in plain words without error codes: what happened, whether
anything was lost, and the one next step (try again, pick another, sign in, ask the shop). Design it as carefully as
the usual day; the design skill's hard states say how.

## Check yourself

Before you say a plan is ready or a screen is built, open each situation at its address and look at it. Alpine also
opens every situation itself and shows the person the ones that look the same as the usual day: those are not done.
