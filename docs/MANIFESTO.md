# MANIFESTE GALAXIA

*Framework open source pour assistant personnel autonome, souverain, permanent.*

*Version 0.2 — 18 avril 2026*

---

## 1. Pourquoi Galaxia existe

Chaque utilisateur d'un assistant IA moderne a vécu la même scène. On lui demande de faire une tâche. Il commence. Puis il s'arrête et demande : *"Voulez-vous que je continue ?"* On dit oui. Il reprend. Trente secondes plus tard : *"Dois-je procéder à l'étape suivante ?"* On dit oui. Encore. Et encore.

Au bout d'une heure, l'utilisateur réalise une chose amère : **c'est lui qui travaille pour l'assistant**, pas l'inverse. Il est devenu le goulot d'étranglement de son propre outil. Son attention, au lieu d'être libérée, est fractionnée en micro-validations permanentes.

Galaxia est née de cette frustration et d'une conviction simple : **un assistant qui a besoin de permission toutes les deux minutes n'est pas un assistant, c'est une télécommande qui parle.**

Un vrai assistant personnel fait son travail. Il ne dérange que quand c'est important. Il continue même quand on dort. Il accepte les ordres d'où qu'on soit, y compris depuis un téléphone dans un taxi. Il ne dépend pas du bon vouloir d'un fournisseur unique. Il appartient à son propriétaire.

Galaxia est le framework qui permet à n'importe qui de se construire cet assistant-là.

---

## 2. Les quatre piliers

Tout dans Galaxia découle de quatre engagements non négociables. Chaque décision technique, chaque feature, chaque ligne de code est filtrée par ces quatre questions. Si une décision viole un pilier, elle est rejetée, même si elle est techniquement élégante.

### Pilier 1 — Autonomie réelle

Galaxia agit. Elle ne demande confirmation **que pour les actions irréversibles** : envoyer un message, effectuer un paiement, publier publiquement, supprimer des données. Pour tout le reste — lire, analyser, chercher, écrire, préparer, tester, proposer — elle exécute sans intervention.

À l'installation, l'utilisateur définit une fois pour toutes son **contrat d'autonomie** : une liste claire de ce que Galaxia peut faire seule et de ce qu'elle doit valider. Ce contrat est respecté à la lettre et reste modifiable à tout moment.

Ce pilier est une rupture philosophique avec les assistants IA actuels. Ceux-ci demandent la permission par défaut parce qu'ils optimisent pour éviter d'avoir tort. Galaxia optimise pour libérer l'attention de son utilisateur. Les deux philosophies sont incompatibles. Galaxia a choisi la seconde.

### Pilier 2 — Continuité 24/7

Galaxia ne s'éteint jamais. Elle vit sur un serveur — VPS loué, machine personnelle allumée en permanence, Raspberry Pi chez soi. Peu importe le substrat, ce qui compte c'est la continuité.

Pendant que son propriétaire dort, travaille, voyage ou déconnecte, Galaxia continue : elle lit les emails qui arrivent, veille sur les sujets qu'on lui a confiés, exécute les tâches programmées, fait avancer les projets en cours. Au réveil, elle présente ce qu'elle a fait et ce qui mérite attention.

Cette continuité n'est pas un luxe technique, c'est l'inverse du modèle chat-bot. Un chat-bot n'existe que quand on lui parle. Galaxia existe en permanence. C'est ce qui la rend assistante plutôt qu'outil.

### Pilier 3 — Pilotage depuis Telegram

Le téléphone n'est pas une interface dégradée de Galaxia. C'est une interface **de première classe**, au même titre que le terminal ou le dashboard web.

Concrètement : toute commande possible sur le poste de travail est possible depuis Telegram. Analyser un dossier, rédiger une réponse, lancer une recherche, interroger un projet en cours, déclencher un agent — tout. Réciproquement, Galaxia alerte son propriétaire sur Telegram pour les décisions qui comptent, jamais pour le bruit.

Telegram a été choisi parce que son API est ouverte, gratuite, stable et documentée. WhatsApp sera étudié dans les versions futures, mais ne sera jamais promis avant d'être livré, parce que son API non-officielle n'offre pas la fiabilité requise par le Pilier 2.

### Pilier 4 — Souveraineté totale

Galaxia appartient à son propriétaire, point.

Cela signifie concrètement : code open source consultable et modifiable ; installation auto-hébergée sur le matériel choisi par l'utilisateur ; clés API fournies par l'utilisateur, jamais par Galaxia ; données stockées localement, jamais remontées vers un serveur central ; choix du LLM laissé à l'utilisateur.

Mais la souveraineté de Galaxia va plus loin qu'un simple choix de fournisseur à l'installation. Elle est **contextuelle et granulaire**. L'utilisateur décide, projet par projet, tâche par tâche, donnée par donnée, si le traitement reste **local** (LLM tournant sur sa machine via Ollama, llama.cpp, ou équivalent, sans qu'aucune information ne sorte de son périmètre) ou s'il est **externalisé** vers un fournisseur distant plus puissant (Anthropic, OpenAI, Mistral, Kimi, ou autre).

Cette décision peut être prise automatiquement par Galaxia selon des règles définies par l'utilisateur — "les emails professionnels passent en local", "l'analyse de contrats sensibles reste en local", "les tâches de brainstorming créatif peuvent aller vers Claude ou GPT-4", "les tâches de code peuvent être dispatchées vers Sonnet selon la complexité". Elle peut aussi être prise explicitement au cas par cas, quand l'utilisateur le souhaite.

Cette architecture répond directement aux exigences de souveraineté des données européennes (RGPD, EU AI Act) et à toute préoccupation légitime de confidentialité professionnelle (cabinets d'avocats, médecins, consultants, entreprises industrielles) — sans sacrifier l'accès à la puissance des grands modèles quand elle est vraiment nécessaire.

Si un fournisseur de LLM ferme, augmente ses prix ou change ses conditions, l'utilisateur modifie ses règles de routage et Galaxia continue. Cette portabilité n'est pas une option avancée, c'est le fondement du projet.

---

## 3. Ce que Galaxia est, et ce qu'elle n'est pas

**Galaxia est** un framework open source qui permet d'installer sur son propre serveur un assistant personnel autonome, orchestrant une équipe d'agents spécialisés, pilotable depuis Telegram ou un dashboard web, capable de travailler en continu et de prendre des initiatives dans le cadre défini par son propriétaire.

**Galaxia n'est pas un clone de ChatGPT.** ChatGPT est conversationnel, centralisé, opaque. Galaxia est autonome, distribuée chez chaque utilisateur, transparente.

**Galaxia n'est pas une plateforme no-code d'automatisation.** n8n, Make, Zapier exécutent des workflows déterministes définis à l'avance. Galaxia décide en temps réel, avec jugement, au sein d'un cadre qu'elle négocie avec son propriétaire.

**Galaxia n'est pas une bibliothèque technique pour développeurs.** LangChain, LlamaIndex sont des briques qu'on assemble soi-même. Galaxia est un produit fini qu'on installe et qui marche.

**Galaxia n'est pas un agent unique.** Elle est une **porte d'entrée** qui coordonne plusieurs agents spécialisés (dev, veille, communication, analyse, maintenance) derrière une interface unifiée. L'utilisateur parle à Galaxia. Galaxia dispatche.

---

## 3.bis — La doctrine du routage

Un principe opérationnel mérite d'être nommé explicitement parce qu'il découle des piliers 1 et 4 mais les dépasse : **Galaxia ne choisit jamais seule où envoyer une donnée ou une tâche, mais elle respecte et applique intelligemment les règles que son utilisateur a définies.**

Concrètement, l'utilisateur déclare à l'installation (et peut modifier à tout moment) un ensemble de règles qui déterminent, pour chaque tâche, quel modèle est consulté :

- **Par nature de donnée.** "Mes emails avec tel client restent en local." "Mes documents marqués 'confidentiel' ne sortent jamais du serveur." "Les contenus publics que je prépare pour LinkedIn peuvent passer par n'importe quel modèle."

- **Par type de tâche.** "Les analyses juridiques restent en local." "Les rédactions créatives peuvent aller vers Claude." "Le code simple passe en local Ollama, le code complexe va sur Sonnet."

- **Par contexte temporel ou économique.** "En semaine je privilégie le local pour économiser les crédits API, le weekend j'ai le droit de consommer." "Quand je voyage hors UE, tout reste en local."

Ces règles ne sont pas cachées dans un fichier de configuration obscur. Elles sont visibles, éditables, auditables. Galaxia rapporte honnêtement, pour chaque action qu'elle entreprend, **quel modèle elle a consulté et pourquoi ce choix a été fait** — traçabilité complète.

Ce principe a trois conséquences importantes :

**Première conséquence.** Galaxia n'est pas captive d'un fournisseur unique. Elle est agnostique par conception. Un utilisateur qui n'a qu'un abonnement Claude peut l'utiliser. Un utilisateur qui ne veut absolument aucun appel externe peut faire tourner Galaxia 100% en local avec Ollama. Un utilisateur qui veut le meilleur des deux mondes combine les deux.

**Deuxième conséquence.** Galaxia reste utilisable dans les contextes les plus sensibles — professions réglementées, environnements à confidentialité extrême, pays avec restrictions d'export de données. Il suffit de configurer les règles en conséquence.

**Troisième conséquence.** Galaxia responsabilise son utilisateur au lieu de décider à sa place. Elle ne prétend pas savoir mieux que lui ce qui doit rester confidentiel. Elle fournit les mécanismes, l'utilisateur fournit le jugement.

---

## 4. Pour qui Galaxia est faite

Galaxia servira deux publics, dans cet ordre.

**Phase 1 — Les développeurs indépendants, entrepreneurs tech, freelances avancés.** Des gens qui ont déjà un VPS ou savent en louer un, qui comprennent ce qu'est une clé API, qui veulent un assistant à la hauteur de leurs ambitions et pas une boîte noire. Ce public sera servi avec une UX terminal + dashboard web + Telegram. L'installation demandera quelques commandes. La documentation sera rigoureuse mais technique.

**Phase 2 — Le grand public souverainiste.** Des gens qui ne sont pas développeurs mais qui ont compris que laisser leur vie dans ChatGPT est fragile, et qui sont prêts à investir un peu d'effort pour reprendre le contrôle. Ce public demandera une UX graphique complète, un installeur en un clic, une documentation vulgarisée. Cette phase n'arrivera que lorsque la phase 1 aura prouvé que le noyau fonctionne vraiment.

Cette chronologie n'est pas négociable. Tenter de servir les deux publics simultanément dilue les décisions produit et aboutit à quelque chose de moyen pour tout le monde. Galaxia sera excellente pour les développeurs d'abord. Le grand public viendra ensuite.

---

## 5. Le modèle du projet

**Licence.** Galaxia est publiée sous licence MIT. Usage libre, modification libre, redistribution libre, usage commercial libre. La seule obligation est de conserver la notice de licence.

Ce choix est délibéré : une licence plus restrictive (AGPL, source-available) protégerait mieux les intérêts commerciaux du projet mais ralentirait son adoption. Galaxia a besoin d'adoption massive pour accomplir sa mission de souveraineté. La licence MIT sert cette mission.

**Gouvernance.** Le projet est initié et maintenu par un créateur unique dans sa phase initiale. Les contributions externes sont encouragées via pull requests. Une gouvernance communautaire plus formelle (comité de maintainers, processus RFC) sera mise en place si le projet atteint une masse critique d'adoption.

**Monétisation.** Le noyau de Galaxia est et restera gratuit. Aucune fonctionnalité essentielle ne sera placée derrière un paywall. Des activités commerciales annexes pourront exister autour du projet — hébergement géré pour ceux qui ne veulent pas s'auto-héberger, support professionnel pour entreprises, formations, consulting. Ces activités financent le développement sans compromettre la promesse de gratuité du cœur.

**Instance de référence.** Le créateur du projet opère une instance personnelle de Galaxia qui sert de banc de test permanent pour le code. Toute release publique passe d'abord par cette instance. Cela garantit qu'aucun commit ne casse l'expérience réelle d'un utilisateur quotidien.

---

## 6. La boussole — quatre questions pour trancher

À chaque décision future — nouvelle feature, refactoring, choix de stack, intégration tierce — on applique cette grille à quatre questions. Si l'une reçoit un "non" clair, la décision est rejetée ou retravaillée.

1. **Est-ce que ça préserve l'autonomie de l'utilisateur ?** Si cette décision ajoute des confirmations, des validations intermédiaires, des frictions — non.

2. **Est-ce que ça marche sans intervention humaine 24h/24 ?** Si cette décision suppose qu'un humain soit réveillé et disponible — non.

3. **Est-ce que ça fonctionne depuis Telegram ?** Si cette décision suppose un écran large, une souris, un clavier physique — non, ou alors en complément et jamais en exclusif.

4. **Est-ce que ça préserve la souveraineté ?** Si cette décision crée une dépendance à un service fermé, propriétaire, non-substituable — non.

Cette boussole est la constitution de Galaxia. Quand un débat technique dure plus de dix minutes, on revient à ces quatre questions. Elles tranchent.

---

## 7. Ce qui vient ensuite

Ce manifeste définit le **pourquoi** et le **quoi**. Il ne définit pas le **comment** — ce sera le rôle de l'architecture technique, document suivant à produire.

À partir de maintenant, chaque ligne de code Galaxia, chaque décision de roadmap, chaque communication publique du projet est rédigée dans l'esprit de ce manifeste. Il est la référence commune qui lie le créateur, les futurs contributeurs et les utilisateurs.

Galaxia ne sera pas le premier assistant IA personnel. Elle sera **le premier qui respecte vraiment son utilisateur.**
