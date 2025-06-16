pipeline {
    agent any

    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'

        AWS_CREDENTIALS_ID = 'aws-credentials'
        SONAR_SCANNER_HOME = tool 'SonarScanner-latest'
    }

    stages {

        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') {
                    sh "${SONAR_SCANNER_HOME}/bin/sonar-scanner"
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build, Scan & Push Images') {
    parallel {

        stage('Backend') {
            agent {
                docker {
                    image 'node:18-alpine'
                    args '--user root -v /var/run/docker.sock:/var/run/docker.sock'
                }
            }
            steps {
                dir('backend') {
                    script {
                        sh 'npm ci || npm install'

                        def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:backend-${env.BUILD_ID}"
                        def backendImage = docker.build(imageName, '.')

                        sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                        docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                            backendImage.push()
                        }
                    }
                }
            }
        }

        stage('Frontend') {
            agent {
                docker {
                    image 'node:18-alpine'
                    args '--user root -v /var/run/docker.sock:/var/run/docker.sock'
                }
            }
            steps {
                dir('frontend') {
                    script {
                        sh 'npm ci || npm install'
                        sh 'npm run build'

                        def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:frontend-${env.BUILD_ID}"
                        def frontendImage = docker.build(imageName, '.')

                        sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                        docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                            frontendImage.push()
                        }
                    }
                }
            }
        }
    }
}


        stage('Deploy to EKS') {
            steps {
                withAWS(credentials: AWS_CREDENTIALS_ID, region: AWS_REGION) {
                    sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}"

                    sh """
                        helm upgrade --install my-app ./helm/my-app \
                            --namespace default \
                            --set backend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                            --set backend.image.tag=backend-${env.BUILD_ID} \
                            --set frontend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                            --set frontend.image.tag=frontend-${env.BUILD_ID}
                    """
                }
            }
        }
    }

    post {
        failure {
            echo "❌ Build failed."
        }
        success {
            echo "✅ Build and deploy successful!"
        }
    }
}
