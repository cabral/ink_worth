---
layout: default
title: Events
permalink: /events/
description: "Upcoming tabletop RPG sessions in Stockholm: one-shots, seasonal campaigns, and special events. Reserve a seat."
---

{% comment %}
  Events split into upcoming and past by date at build time. GitHub Pages
  only rebuilds on push, so reservations.js also checks the date in the
  browser and stops taking reservations for a session that has passed.
{% endcomment %}
{% assign today = site.time | date: '%F' %}
{% assign events = site.events | sort: 'date' %}
{% assign upcoming_count = 0 %}
{% for event in events %}
  {% assign day = event.date | date: '%F' %}
  {% if day >= today %}{% assign upcoming_count = upcoming_count | plus: 1 %}{% endif %}
{% endfor %}
{% assign past_count = events.size | minus: upcoming_count %}

<div class="prose">
  <p class="page-label">Part 02 &middot; Live RPG in Stockholm</p>
  <h1>Events</h1>

  <p>Upcoming sessions, one-shots, and seasonal campaign games. Seats are limited
  and reservations are first come, first served, with no account or login needed.
  Open an event to reserve, or to join the waiting list once it's full.</p>

  <h2 class="list-heading">Upcoming</h2>
  {% if upcoming_count == 0 %}
    <p><em>No sessions scheduled just yet. Check back soon.</em></p>
  {% else %}
  <ul class="event-list">
    {% for event in events %}
    {% assign day = event.date | date: '%F' %}
    {% if day >= today %}
    <li class="event-card">
      <time class="event-date" datetime="{{ day }}">
        <span>{{ event.date | date: "%a" }}</span>
        <span class="event-date__day">{{ event.date | date: "%-d" }}</span>
        <span>{{ event.date | date: "%b" }}</span>
      </time>
      <div>
        <h3 class="event-card__title"><a href="{{ event.url | relative_url }}">{{ event.title }}</a></h3>
        <p class="event-meta">
          {% if event.time %}<span>{{ event.time }}</span>{% endif %}
          {% if event.location %}<span>{{ event.location }}</span>{% endif %}
          {% if event.system %}<span>{{ event.system }}</span>{% endif %}
        </p>
        {% if event.summary %}<p class="event-card__excerpt">{{ event.summary }}</p>{% endif %}
        {% include seats.html event=event %}
      </div>
    </li>
    {% endif %}
    {% endfor %}
  </ul>
  {% endif %}

  {% if past_count > 0 %}
  <h2 class="list-heading">Past sessions</h2>
  <ul class="past-list">
    {% for event in events reversed %}
    {% assign day = event.date | date: '%F' %}
    {% if day < today %}
    <li>
      <time datetime="{{ day }}">{{ event.date | date: "%-d %b %Y" }}</time>
      <a href="{{ event.url | relative_url }}">{{ event.title }}</a>
    </li>
    {% endif %}
    {% endfor %}
  </ul>
  {% endif %}
</div>

<script src="{{ '/assets/js/reservations.js' | relative_url }}?v={{ site.time | date: '%s' }}" defer></script>
