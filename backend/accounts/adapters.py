from dataclasses import dataclass

from allauth.account.adapter import DefaultAccountAdapter
from allauth.headless.adapter import DefaultHeadlessAdapter


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        return False


class HeadlessAdapter(DefaultHeadlessAdapter):
    def get_user_dataclass(self):
        @dataclass
        class User(super().get_user_dataclass()):
            is_staff: bool = False

        return User

    def user_as_dataclass(self, user):
        data = super().user_as_dataclass(user)
        data.is_staff = user.is_staff
        return data
