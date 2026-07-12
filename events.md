---
layout: default
title: Events
permalink: /events/
description: "Upcoming tabletop RPG sessions in Stockholm: one-shots, seasonal campaigns, and special events. Reserve a seat."
---

{% include events-style.html %}

{% assign su = site.supabase %}
<div class="prose">
  <div class="page-label">Stockholm RPG · reserve a seat</div>
  <h1>Events</h1>

  <p>Upcoming sessions, one-shots, and seasonal campaign games. Seats are limited
  and reservations are first come, first served, with no account or login needed.
  Open an event to reserve, or to join the waiting list once it's full.</p>

  {% assign upcoming = site.events | sort: 'date' %}
  {% if upcoming.size == 0 %}
    <p><em>No events scheduled just yet. Check back soon.</em></p>
  {% else %}
  <ul class="event-list" data-supabase-url="{{ su.url }}" data-supabase-key="{{ su.anon_key }}">
    {% for event in upcoming %}
    <li class="event-card">
      {% if event.system %}<div class="event-card__system">{{ event.system }}</div>{% endif %}
      <h2 class="event-card__title"><a href="{{ event.url | relative_url }}">{{ event.title }}</a></h2>
      <div class="event-meta">
        {% if event.date %}<span><strong>{{ event.date | date: "%a %-d %b" }}</strong></span>{% endif %}
        {% if event.time %}<span>{{ event.time }}</span>{% endif %}
        {% if event.location %}<span>{{ event.location }}</span>{% endif %}
      </div>
      {% if event.summary %}<p class="event-card__excerpt">{{ event.summary }}</p>{% endif %}
      <span class="availability" data-inkworth-availability
            data-slug="{{ event.event_id }}"
            data-capacity="{{ event.capacity | default: 0 }}"
            data-status="{{ event.status | default: 'open' | downcase }}">Checking availability…</span>
      <div class="seat-meter"><div class="seat-meter__fill"></div></div>
    </li>
    {% endfor %}
  </ul>
  {% endif %}
</div>

<script src="{{ '/assets/js/reservations.js' | relative_url }}" defer></script>
