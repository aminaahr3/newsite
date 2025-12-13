--
-- PostgreSQL database dump
--

\restrict 7reQLhLh97Ik31yja7Lr4e6vQhyBFPgc6qkCEskAMi0fVrThRtaYOAmL5CR3EMW

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.categories VALUES (1, 'concerts', 'Концерты');
INSERT INTO public.categories VALUES (2, 'theater', 'Театр');
INSERT INTO public.categories VALUES (3, 'sports', 'Спорт');
INSERT INTO public.categories VALUES (4, 'exhibitions', 'Выставки');
INSERT INTO public.categories VALUES (5, 'cinema', 'Кино');
INSERT INTO public.categories VALUES (6, 'exhibitions', 'Выставки');
INSERT INTO public.categories VALUES (7, 'museums', 'Музеи');
INSERT INTO public.categories VALUES (8, 'quest', 'Квест комната');
INSERT INTO public.categories VALUES (9, 'extreme', 'Экстрим');
INSERT INTO public.categories VALUES (10, 'daily', 'Daily');
INSERT INTO public.categories VALUES (11, 'rage_room', 'Комната гнева');
INSERT INTO public.categories VALUES (12, 'billiards', 'Бильярд');
INSERT INTO public.categories VALUES (13, 'bowling', 'Боулинг');


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.cities VALUES (1, 'Москва');
INSERT INTO public.cities VALUES (2, 'Санкт-Петербург');
INSERT INTO public.cities VALUES (3, 'Казань');
INSERT INTO public.cities VALUES (4, 'Сочи');
INSERT INTO public.cities VALUES (5, 'Новосибирск');
INSERT INTO public.cities VALUES (6, 'Альметьевск');
INSERT INTO public.cities VALUES (7, 'Ангарск');
INSERT INTO public.cities VALUES (8, 'Армавир');
INSERT INTO public.cities VALUES (9, 'Архангельск');
INSERT INTO public.cities VALUES (10, 'Астрахань');
INSERT INTO public.cities VALUES (11, 'Балаково');
INSERT INTO public.cities VALUES (12, 'Балашиха');
INSERT INTO public.cities VALUES (13, 'Барнаул');
INSERT INTO public.cities VALUES (14, 'Батайск');
INSERT INTO public.cities VALUES (15, 'Белгород');
INSERT INTO public.cities VALUES (16, 'Березники');
INSERT INTO public.cities VALUES (17, 'Бийск');
INSERT INTO public.cities VALUES (18, 'Братск');
INSERT INTO public.cities VALUES (19, 'Брянск');
INSERT INTO public.cities VALUES (20, 'Буйнакск');
INSERT INTO public.cities VALUES (21, 'Великий Новгород');
INSERT INTO public.cities VALUES (22, 'Владивосток');
INSERT INTO public.cities VALUES (23, 'Владикавказ');
INSERT INTO public.cities VALUES (24, 'Волгоград');
INSERT INTO public.cities VALUES (25, 'Воронеж');
INSERT INTO public.cities VALUES (26, 'Дербент');
INSERT INTO public.cities VALUES (27, 'Екатеринбург');
INSERT INTO public.cities VALUES (28, 'Краснодар');
INSERT INTO public.cities VALUES (29, 'Красноярск');
INSERT INTO public.cities VALUES (30, 'Ростов-на-Дону');
INSERT INTO public.cities VALUES (31, 'Грозный');


--
-- Data for Name: event_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.event_templates VALUES (4, 'Энди Уорхол и русское искусство', 'Диалог культур: поп-арт встречается с русским авангардом. Редкие работы из частных коллекций.', 6, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (2, 'VR Gallery', 'Интерактивная выставка виртуальной реальности. Путешествие по лучшим музеям мира, не выходя из зала.', 6, NULL, true, '2025-12-12 11:02:12.026801', 'https://www.marinabaysands.com/content/dam/revamp/ASMrevamp/VRgallery/VR-Gallery-Photo-Shoot-1-800x490.jpg');
INSERT INTO public.event_templates VALUES (1, 'Сальвадор Дали & Пабло Пикассо', 'Уникальная выставка двух гениев сюрреализма и кубизма. Погрузитесь в мир невероятных образов и революционного искусства XX века.', 6, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (3, 'Реальный космос', 'Выставка космических артефактов и интерактивных экспонатов. Настоящие скафандры, модели ракет и симуляторы невесомости.', 6, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (5, 'Айвазовский. Кандинский. Живые полотна', 'Мультимедийная выставка: классические шедевры оживают на огромных экранах под музыку.', 6, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (6, 'Музей восковых фигур', 'Более 100 реалистичных восковых фигур мировых знаменитостей. Фотосессия с любимыми звёздами.', 7, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (7, 'VR Музей', 'Музей виртуальной реальности с погружением в разные эпохи и миры.', 7, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (24, 'Профессиональный Тир', 'Стрельба из различных видов оружия под руководством инструктора.', 9, NULL, true, '2025-12-12 11:02:12.026801', 'https://cdn-ua.bodo.gift/resize/upload/files/cm-experience/106/105781/images_file/all_all_big-t1701090100-r1w568h318q90zc1.jpg');
INSERT INTO public.event_templates VALUES (8, 'Музей истории оружия', 'Коллекция холодного и огнестрельного оружия разных эпох. Интерактивные экспонаты.', 7, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (9, 'Музей драгоценностей', 'Уникальная коллекция украшений, минералов и драгоценных камней со всего мира.', 7, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (10, 'Планетарий Saturn', 'Полнокупольные шоу о космосе, звёздах и галактиках. Образовательные программы для всех возрастов.', 7, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (11, 'Последняя экскурсия. Выжить любой ценой', 'Хоррор-квест с актёрами. Вы оказались в заброшенном музее с темной историей. Успейте выбраться за 60 минут.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (12, 'Обитель проклятых', 'Мистический квест в атмосфере старинного особняка. Разгадайте тайну проклятия семьи.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (13, 'Побег из Алькатраса', 'Классический побег из тюрьмы. Логические загадки и механические головоломки.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (14, 'Ограбление банка', 'Командный квест. Спланируйте и проведите идеальное ограбление.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (15, 'Машина Времени', 'Научно-фантастический квест с путешествием по разным эпохам.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (16, 'Не дыши', 'Стелс-хоррор квест. Пробирайтесь через дом слепого убийцы.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (17, 'Аутласт', 'Экстремальный хоррор-квест по мотивам игры. Только для смелых.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (18, 'Шерлок', 'Детективный квест. Расследуйте преступление вместе с великим сыщиком.', 8, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (19, 'Аэротруба', 'Полёт в аэродинамической трубе. Ощущение свободного падения без прыжка с самолёта.', 9, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (20, 'Прогулка на лошадях', 'Конная прогулка по живописным маршрутам с инструктором.', 9, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (21, 'Картинг', 'Гонки на профессиональных картах. Соревнуйтесь с друзьями на скорость.', 9, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (22, 'Пейнтбол', 'Командная игра в пейнтбол на оборудованной площадке.', 9, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (23, 'Прогулка на квадроциклах', 'Экстремальная поездка по бездорожью на мощных квадроциклах.', 9, NULL, true, '2025-12-12 11:02:12.026801', NULL);
INSERT INTO public.event_templates VALUES (25, 'Дегустация сыров и вин', 'Изысканная дегустация элитных сыров и вин с сомелье. 6 сортов вина и 8 видов сыра.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (26, 'Дегустация Пива', 'Крафтовые сорта пива от локальных пивоварен с закусками.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (27, 'Дегустация Чая', 'Чайная церемония с редкими сортами чая из Китая, Японии и Индии.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (28, 'Кинотеатр на Крыше', 'Показ фильмов под открытым небом с потрясающим видом на город.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (29, 'Контактный зоопарк', 'Общение с ручными животными: кролики, козы, ламы, еноты и другие.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (30, 'Party Bus', 'Вечеринка в движении! Автобус с музыкой, светом и танцполом.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (31, 'Выставка "Retro life"', 'Погружение в атмосферу 60-80х годов. Ретро-техника, мода и интерьеры.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (32, 'Фестиваль японской культуры', 'Косплей, аниме, манга, японская кухня и мастер-классы.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (33, 'Кулинарный мастер класс', 'Готовим изысканные блюда вместе с профессиональным шефом.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (34, 'Фестиваль иллюзионистов', 'Шоу-программа от лучших фокусников и иллюзионистов страны.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (35, 'Гастро-тур "Tasty"', 'Гастрономическое путешествие по лучшим заведениям города.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (36, 'Мотошоу "Extreme"', 'Каскадёрские трюки на мотоциклах. Огонь, скорость, адреналин!', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (37, 'Лазерное шоу с диджеем', 'Ночное лазерное шоу с лучшими диджеями города.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (38, 'Романтика на закате', 'Романтический вечер на крыше с видом на закат. Шампанское и фуршет.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (39, 'Фестиваль BBQ & Smoke', 'Фестиваль барбекю: мясо на гриле, копчёности и street food.', 10, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (40, 'Комната гнева', 'Снимите стресс! Разбейте всё, что угодно: посуду, технику, мебель. Безопасно и весело.', 11, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (41, 'Бильярд', 'Профессиональные бильярдные столы. Русский бильярд и пул.', 12, NULL, true, '2025-12-12 11:02:43.950618', NULL);
INSERT INTO public.event_templates VALUES (42, 'Боулинг', 'Современные дорожки для боулинга. Идеально для семейного отдыха и корпоративов.', 13, NULL, true, '2025-12-12 11:02:43.950618', NULL);


--
-- Data for Name: event_template_addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.event_template_addresses VALUES (2, 24, 26, 'ул, Сальмана 12');
INSERT INTO public.event_template_addresses VALUES (3, 2, 6, 'сашпендра 12');


--
-- Data for Name: event_template_images; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.event_template_images VALUES (3, 24, 'https://cdn-ua.bodo.gift/resize/upload/files/cm-experience/106/105781/images_file/all_all_big-t1701090100-r1w568h318q90zc1.jpg', 0, '2025-12-13 07:23:17.417011');
INSERT INTO public.event_template_images VALUES (4, 2, 'https://www.marinabaysands.com/content/dam/revamp/ASMrevamp/VRgallery/VR-Gallery-Photo-Shoot-1-800x490.jpg', 0, '2025-12-13 09:17:35.681683');


--
-- Data for Name: generated_links; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.generated_links VALUES (30, 'LNK-ZKHQMW', 24, 26, '2025-12-12', '20:00:00', 'ул, Сальмана 12', 4, true, '2025-12-13 08:01:30.528253');
INSERT INTO public.generated_links VALUES (31, 'LNK-KDGSWZ', 24, 26, '2025-12-12', '18:00:00', 'ул, Сальмана 12', 3, true, '2025-12-13 08:21:21.784386');
INSERT INTO public.generated_links VALUES (32, 'LNK-RUXP4C', 24, 26, '2025-12-12', '17:00:00', 'ул, Сальмана 12', 33, true, '2025-12-13 08:37:03.905671');


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 13, true);


--
-- Name: cities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cities_id_seq', 31, true);


--
-- Name: event_template_addresses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.event_template_addresses_id_seq', 3, true);


--
-- Name: event_template_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.event_template_images_id_seq', 4, true);


--
-- Name: event_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.event_templates_id_seq', 42, true);


--
-- Name: generated_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.generated_links_id_seq', 32, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 7reQLhLh97Ik31yja7Lr4e6vQhyBFPgc6qkCEskAMi0fVrThRtaYOAmL5CR3EMW

