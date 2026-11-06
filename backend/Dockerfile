FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./

RUN chmod +x mvnw
RUN ./mvnw -q -DskipTests dependency:go-offline

COPY src ./src

RUN ./mvnw -q -DskipTests package

ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "java -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Dserver.port=${PORT:-10000} -Dserver.address=0.0.0.0 -jar target/traveldesk-backend-0.0.1-SNAPSHOT.jar"]