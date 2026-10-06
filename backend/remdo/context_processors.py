from django.conf import settings


def analytics(_request):
    return {"umami_website_id": settings.UMAMI_WEBSITE_ID}
