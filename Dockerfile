FROM node:20-slim
ENV PORT ${PORT:-7860}
EXPOSE ${PORT}
ARG USERNAME=node
USER ${USERNAME}
WORKDIR /home/${USERNAME}/app 
COPY --chown=${USERNAME}:${USERNAME} ./package.json ./package.json
COPY --chown=${USERNAME}:${USERNAME} ./package-lock.json ./package-lock.json
COPY --chown=${USERNAME}:${USERNAME} ./.npmrc ./.npmrc
RUN npm ci
COPY --chown=${USERNAME}:${USERNAME} . .
RUN npm run build
WORKDIR /home/${USERNAME}/app/js13kserver
CMD [ "index.js" ]
