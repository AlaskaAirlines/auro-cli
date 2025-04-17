# Semantic Release Automated Changelog

# [2.0.0-rc.1](https://github.com/AlaskaAirlines/auro-cli/compare/v1.2.0...v2.0.0-rc.1) (2025-04-17)


### Bug Fixes

* add conditional to skip push events when associated with a pull request ([83ec52b](https://github.com/AlaskaAirlines/auro-cli/commit/83ec52ba751115d0b512685808f646a3f0df7e7d))
* adjust workflow triggers to simplify event handling and remove push events for pull requests ([c958da0](https://github.com/AlaskaAirlines/auro-cli/commit/c958da06977bf5843200fd35b31787f12d9f2b41))
* allow overwriting of input files in build configuration ([2af1ce2](https://github.com/AlaskaAirlines/auro-cli/commit/2af1ce21a3a8ee9dc369b9f00ea6a39d44f59832))
* correct conditional syntax for release job trigger in workflow ([433c91d](https://github.com/AlaskaAirlines/auro-cli/commit/433c91d873a7ee4e929f6323fbe99b7fee1a7fc7))
* ensure release job runs after successful tests and skips on test failure ([eb1bf7b](https://github.com/AlaskaAirlines/auro-cli/commit/eb1bf7b1cd473a1d44bb8388308dc1f5841cd568))
* include 'dev' branch in workflow triggers for pull requests and pushes ([1f8b389](https://github.com/AlaskaAirlines/auro-cli/commit/1f8b38929c3d0fd6b1196d10b10f851063384a6d))
* refine conditional logic for test job to skip on associated PRs ([6bcdb73](https://github.com/AlaskaAirlines/auro-cli/commit/6bcdb73132793ca052df431f3c62acc0b07cbb84))
* remove unnecessary dependency on test job for release job in workflow ([0bd52a7](https://github.com/AlaskaAirlines/auro-cli/commit/0bd52a7236a8f4ef078b9459be139b0c5ab1ac4a))
* simplify conditional logic for release job trigger in workflow ([6d2a5ec](https://github.com/AlaskaAirlines/auro-cli/commit/6d2a5ec8a6ec80d8213028a99f609d465ac1f3e5))
* update conditional logic for test job and adjust prerelease setting in .releaserc ([48c7ad7](https://github.com/AlaskaAirlines/auro-cli/commit/48c7ad75db7f78a4a4d849b61edf06e95d51e8cc))
* update conditional logic for test job to skip push events with associated PRs ([50c403a](https://github.com/AlaskaAirlines/auro-cli/commit/50c403a47c26faa86e156105d74e215f8ee179d2))
* update conditional logic to skip test job on pushes with associated PRs ([765eb11](https://github.com/AlaskaAirlines/auro-cli/commit/765eb1100700f3546214f98b8c486196a770e3d7))
* update copy-files script to include the force flag for file copying ([7efc129](https://github.com/AlaskaAirlines/auro-cli/commit/7efc129779114a3fe7641810cf7b67f2ca427097))
* update option flags in migrate command to work with v13 of commander ([f889b4e](https://github.com/AlaskaAirlines/auro-cli/commit/f889b4e1a8fb4fa40e30ec70bc4362860ac8c000))


### Features

* enhance dev command options and improve middleware for better routing ([45f9025](https://github.com/AlaskaAirlines/auro-cli/commit/45f902514d199e23b0023c7d18b3ecaf4f268046))


### BREAKING CHANGES

* The migrate command has been updated to use the new Commander v13 option flag format. The --multi-gitter (-m) and --id (-i) flag now requires the proper syntax as Commander v13 changed how flags are handled.

Users who had scripts or workflows using the previous format will need to update their commands to match the new expected syntax.
