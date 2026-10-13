import re
from dataclasses import dataclass
from datetime import date
from math import ceil

import markdown
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.shortcuts import render
from django.utils.html import strip_tags
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

from .public_pages import SLUG_PATTERN, is_text, read_page

DEFAULT_AUTHOR = "RemDo team"
WORDS_PER_MINUTE = 200


# Browsers read a backslash as a slash and drop tabs and newlines, so a path such as
# `/\host` or `/<tab>/host` would name another origin.
SITE_PATH = re.compile(r"/[^/\\\s][^\\\s]*")


def is_site_path(value):
    # An absolute path keeps readers' requests on this origin.
    return is_text(value) and bool(SITE_PATH.fullmatch(value))


POST_FIELDS = {
    "title": is_text,
    "description": is_text,
    "date": lambda value: type(value) is date,
    "topic": is_text,
    "image": is_site_path,
    "author": lambda value: value is None or is_text(value),
}


@dataclass(frozen=True)
class Post:
    slug: str
    title: str
    description: str
    date: date
    topic: str
    image: str
    author: str
    body: str


def load_posts():
    posts = []
    for path in settings.BLOG_DIR.glob("*.md"):
        if not re.fullmatch(SLUG_PATTERN, path.stem):
            raise ImproperlyConfigured(
                f"Invalid blog post file name {path.name}: "
                "use lowercase letters and digits, optionally separated by single hyphens"
            )
        metadata, body = read_page(path, POST_FIELDS)
        fields = {key: metadata.get(key) for key in POST_FIELDS}
        fields["author"] = fields["author"] or DEFAULT_AUTHOR
        posts.append(Post(slug=path.stem, body=body, **fields))
    return sorted(posts, key=lambda post: (-post.date.toordinal(), post.slug))


@never_cache
@require_safe
def blog_index(request):
    return render(
        request,
        "pages/blog/index.html",
        {"canonical": f"{settings.APP_ORIGIN}/blog/", "posts": load_posts()},
    )


@never_cache
@require_safe
def blog_post(request, slug):
    posts = load_posts()
    position = next((index for index, post in enumerate(posts) if post.slug == slug), None)
    if position is None:
        raise Http404
    post = posts[position]
    # Page sources are trusted, reviewed repository content, like templates.
    body = markdown.markdown(post.body)
    return render(
        request,
        "pages/blog/post.html",
        {
            "canonical": f"{settings.APP_ORIGIN}/blog/{slug}/",
            "post": post,
            "body": body,
            "reading_minutes": max(1, ceil(len(strip_tags(body).split()) / WORDS_PER_MINUTE)),
            "next_post": posts[position + 1] if position + 1 < len(posts) else None,
        },
    )
