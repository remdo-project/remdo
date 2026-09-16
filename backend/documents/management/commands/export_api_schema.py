from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.test import RequestFactory
from django.urls import resolve, reverse


class Command(BaseCommand):
    help = "Export a configured OpenAPI schema for client generation."

    def add_arguments(self, parser):
        parser.add_argument("--kind", required=True, choices=["application", "account"])

    def handle(self, kind, **options):
        if kind == "application":
            call_command(
                "spectacular",
                format="openapi-json",
                validate=True,
                fail_on_warn=True,
                stdout=self.stdout,
            )
        else:
            path = reverse("headless:openapi_json")
            response = resolve(path).func(RequestFactory().get(path))
            self.stdout.write(response.content.decode())
