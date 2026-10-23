.PHONY: help clean build dev version

EXT_NAME  := extenso
VERSION   ?= $(shell grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
DIST_DIR  := dist
STAGE_DIR := $(DIST_DIR)/$(EXT_NAME)
SRC_FILES := manifest.json background/ devtools/ icons/ lib/ modules/ options/ popup/ third_party/ ui/ LICENSE

CYAN  := \033[0;36m
GREEN := \033[0;32m
NC    := \033[0m

help: ## Show this help
	@echo "$(CYAN)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

.DEFAULT_GOAL := help

clean: ## Remove the dist directory
	@rm -rf $(DIST_DIR)

build: clean ## Build the distributable zip with VERSION stamped into its manifest
	@mkdir -p $(STAGE_DIR)
	@cp -R $(patsubst %/,%,$(SRC_FILES)) $(STAGE_DIR)/
	@jq --arg v "$(patsubst v%,%,$(VERSION))" '.version = $$v' manifest.json > $(STAGE_DIR)/manifest.json
	@cd $(STAGE_DIR) && zip -qr ../$(EXT_NAME)-$(VERSION).zip . -x "*.DS_Store"
	@rm -rf $(STAGE_DIR)
	@echo "$(GREEN)Built: $(DIST_DIR)/$(EXT_NAME)-$(VERSION).zip$(NC)"

dev: ## Print how to load the unpacked extension
	@echo "chrome://extensions -> Developer mode -> Load unpacked -> $(CURDIR)"

version: ## Print the next version, derived from the last commit message
	@LATEST_TAG=$$(git tag --sort=-v:refname | head -n1 || echo "0.0.0"); \
	LATEST_TAG=$${LATEST_TAG#v}; \
	MAJOR=$$(echo "$$LATEST_TAG" | cut -d. -f1); \
	MINOR=$$(echo "$$LATEST_TAG" | cut -d. -f2); \
	PATCH=$$(echo "$$LATEST_TAG" | cut -d. -f3); \
	MAJOR=$${MAJOR:-0}; MINOR=$${MINOR:-0}; PATCH=$${PATCH:-0}; \
	COMMIT_MSG="$$(git log -1 --pretty=%B)"; \
	if echo "$$COMMIT_MSG" | grep -q "\[major-release\]"; then \
		MAJOR=$$((MAJOR + 1)); MINOR=0; PATCH=0; \
	elif echo "$$COMMIT_MSG" | grep -q "\[minor-release\]"; then \
		MINOR=$$((MINOR + 1)); PATCH=0; \
	else \
		PATCH=$$((PATCH + 1)); \
	fi; \
	echo "v$${MAJOR}.$${MINOR}.$${PATCH}"
